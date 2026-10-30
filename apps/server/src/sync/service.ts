import { compareHlc, decodeHlc, isHlc } from '@papyrus/shared'
import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import {
  bookmarks,
  books,
  counters,
  files,
  highlights,
  readingProgress,
  readStatus,
} from '../db/schema.ts'

export const READ_STATUSES = ['unread', 'reading', 'finished'] as const
export type ReadStatus = (typeof READ_STATUSES)[number]

/** Reading progress at or beyond this counts as finished (ticket 08). */
export const FINISHED_AT = 0.98
/**
 * An Audio File is finished only in its last seconds: 98% of a ten-hour recording would
 * still leave twelve minutes to listen to.
 */
export const AUDIO_FINISHED_WITHIN_SECONDS = 30
/** Changes stamped further ahead than this are dropped, so a wrong clock can't win forever. */
const MAX_CLOCK_LEAD_MS = 24 * 60 * 60 * 1000

export interface BookmarkFields {
  id: string
  fileId: string
  cfi: string
  snippet: string
  deleted: boolean
  hlc: string
}

export interface HighlightFields {
  id: string
  fileId: string
  cfiRange: string
  colour: string
  text: string
  note: string | null
  deleted: boolean
  hlc: string
}

export type Change =
  | { kind: 'progress'; fileId: string; cfi: string; fraction: number; hlc: string }
  | { kind: 'readStatus'; bookId: string; status: ReadStatus; hlc: string }
  | ({ kind: 'bookmark' } & BookmarkFields)
  | ({ kind: 'highlight' } & HighlightFields)

export type ServerRecord =
  | {
      kind: 'progress'
      fileId: string
      bookId: string
      cfi: string
      fraction: number
      deviceId: string
      hlc: string
    }
  | { kind: 'readStatus'; bookId: string; status: ReadStatus; hlc: string }
  | ({ kind: 'bookmark'; bookId: string } & BookmarkFields)
  | ({ kind: 'highlight'; bookId: string } & HighlightFields)

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const sqlIncrement = sql`${counters.value} + 1`

const rank = (s: string) => READ_STATUSES.indexOf(s as ReadStatus)

/**
 * Last write wins per record on HLC timestamps (ADR 0002). Every accepted write gets a
 * new serverSeq, which is what devices pull by.
 */
export class SyncService {
  private readonly db: Db
  private readonly now: () => number

  constructor(db: Db, now: () => number = Date.now) {
    this.db = db
    this.now = now
  }

  apply(profileId: string, deviceId: string, changes: Change[]): { applied: number } {
    let applied = 0
    this.db.transaction((tx) => {
      for (const change of changes) {
        if (!this.validHlc(change.hlc)) continue
        if (change.kind === 'progress' && this.applyProgress(tx, profileId, deviceId, change))
          applied++
        if (change.kind === 'readStatus' && this.applyStatus(tx, profileId, change)) applied++
        if (change.kind === 'bookmark' && this.applyBookmark(tx, profileId, change)) applied++
        if (change.kind === 'highlight' && this.applyHighlight(tx, profileId, change)) applied++
      }
    })
    return { applied }
  }

  /** Everything for the Profile written after `cursor`, and the cursor to use next time. */
  pull(profileId: string, cursor: number): { cursor: number; records: ServerRecord[] } {
    const progress = this.db
      .select({ p: readingProgress, bookId: files.bookId })
      .from(readingProgress)
      .innerJoin(files, eq(files.id, readingProgress.fileId))
      .where(and(eq(readingProgress.profileId, profileId), gt(readingProgress.serverSeq, cursor)))
      .all()
    const statuses = this.db
      .select()
      .from(readStatus)
      .where(and(eq(readStatus.profileId, profileId), gt(readStatus.serverSeq, cursor)))
      .all()
    const marks = this.db
      .select({ b: bookmarks, bookId: files.bookId })
      .from(bookmarks)
      .innerJoin(files, eq(files.id, bookmarks.fileId))
      .where(and(eq(bookmarks.profileId, profileId), gt(bookmarks.serverSeq, cursor)))
      .all()
    const lights = this.db
      .select({ h: highlights, bookId: files.bookId })
      .from(highlights)
      .innerJoin(files, eq(files.id, highlights.fileId))
      .where(and(eq(highlights.profileId, profileId), gt(highlights.serverSeq, cursor)))
      .all()
    return {
      cursor: this.currentSeq(),
      records: [
        ...marks.map(
          ({ b, bookId }): ServerRecord => ({
            kind: 'bookmark',
            bookId,
            id: b.id,
            fileId: b.fileId,
            cfi: b.cfi,
            snippet: b.snippet,
            deleted: b.deleted,
            hlc: b.hlc,
          }),
        ),
        ...lights.map(
          ({ h, bookId }): ServerRecord => ({
            kind: 'highlight',
            bookId,
            id: h.id,
            fileId: h.fileId,
            cfiRange: h.cfiRange,
            colour: h.colour,
            text: h.text,
            note: h.note,
            deleted: h.deleted,
            hlc: h.hlc,
          }),
        ),
        ...progress.map(
          ({ p, bookId }): ServerRecord => ({
            kind: 'progress',
            fileId: p.fileId,
            bookId,
            cfi: p.cfi,
            fraction: p.fraction,
            deviceId: p.deviceId,
            hlc: p.hlc,
          }),
        ),
        ...statuses.map(
          (s): ServerRecord => ({
            kind: 'readStatus',
            bookId: s.bookId,
            status: s.status as ReadStatus,
            hlc: s.hlc,
          }),
        ),
      ],
    }
  }

  progressFor(profileId: string, fileId: string) {
    return this.db
      .select()
      .from(readingProgress)
      .where(and(eq(readingProgress.profileId, profileId), eq(readingProgress.fileId, fileId)))
      .get()
  }

  statusFor(profileId: string, bookIds: string[]): Map<string, ReadStatus> {
    if (!bookIds.length) return new Map()
    const rows = this.db
      .select()
      .from(readStatus)
      .where(and(eq(readStatus.profileId, profileId), inArray(readStatus.bookId, bookIds)))
      .all()
    return new Map(rows.map((r) => [r.bookId, r.status as ReadStatus]))
  }

  /** The most recently read File of each Book, for "Continue reading" and resuming. */
  latestProgress(profileId: string, bookIds: string[]) {
    const out = new Map<
      string,
      { fileId: string; fraction: number; readAt: number; duration: number | null }
    >()
    if (!bookIds.length) return out
    const rows = this.db
      .select({ p: readingProgress, bookId: files.bookId, duration: files.duration })
      .from(readingProgress)
      .innerJoin(files, eq(files.id, readingProgress.fileId))
      .where(and(eq(readingProgress.profileId, profileId), inArray(files.bookId, bookIds)))
      .all()
    for (const { p, bookId, duration } of rows) {
      const current = out.get(bookId)
      const readAt = decodeHlc(p.hlc).wall
      if (!current || readAt > current.readAt)
        out.set(bookId, { fileId: p.fileId, fraction: p.fraction, readAt, duration })
    }
    return out
  }

  private validHlc(hlc: string): boolean {
    return isHlc(hlc) && decodeHlc(hlc).wall <= this.now() + MAX_CLOCK_LEAD_MS
  }

  private nextSeq(tx: Tx): number {
    const row = tx
      .insert(counters)
      .values({ name: 'sync', value: 1 })
      .onConflictDoUpdate({ target: counters.name, set: { value: sqlIncrement } })
      .returning()
      .get()
    return row.value
  }

  private currentSeq(): number {
    return this.db.select().from(counters).where(eq(counters.name, 'sync')).get()?.value ?? 0
  }

  private applyProgress(
    tx: Tx,
    profileId: string,
    deviceId: string,
    c: Extract<Change, { kind: 'progress' }>,
  ): boolean {
    // A deleted File or Book drops the change without an error (ticket 08).
    const file = tx
      .select({ bookId: files.bookId, duration: files.duration })
      .from(files)
      .where(eq(files.id, c.fileId))
      .get()
    if (!file) return false
    const existing = tx
      .select({ hlc: readingProgress.hlc })
      .from(readingProgress)
      .where(and(eq(readingProgress.profileId, profileId), eq(readingProgress.fileId, c.fileId)))
      .get()
    if (existing && compareHlc(existing.hlc, c.hlc) >= 0) return false
    const fraction = Math.min(1, Math.max(0, c.fraction))
    const row = { cfi: c.cfi, fraction, deviceId, hlc: c.hlc, serverSeq: this.nextSeq(tx) }
    tx.insert(readingProgress)
      .values({ profileId, fileId: c.fileId, ...row })
      .onConflictDoUpdate({ target: [readingProgress.profileId, readingProgress.fileId], set: row })
      .run()
    const finished = file.duration
      ? (1 - fraction) * file.duration <= AUDIO_FINISHED_WITHIN_SECONDS
      : fraction >= FINISHED_AT
    this.deriveStatus(tx, profileId, file.bookId, finished, c.hlc)
    return true
  }

  /**
   * Progress moves Read Status forward only (unread → reading → finished), and only when it
   * is newer than the current status, so a status set by hand later always wins.
   */
  private deriveStatus(tx: Tx, profileId: string, bookId: string, finished: boolean, hlc: string) {
    const target: ReadStatus = finished ? 'finished' : 'reading'
    const current = tx
      .select()
      .from(readStatus)
      .where(and(eq(readStatus.profileId, profileId), eq(readStatus.bookId, bookId)))
      .get()
    if (current && (rank(target) <= rank(current.status) || compareHlc(hlc, current.hlc) <= 0))
      return
    const row = { status: target, hlc, serverSeq: this.nextSeq(tx) }
    tx.insert(readStatus)
      .values({ profileId, bookId, ...row })
      .onConflictDoUpdate({ target: [readStatus.profileId, readStatus.bookId], set: row })
      .run()
  }

  /**
   * Last write wins for a Read Status written by the server itself, as when Books are merged
   * or split (ticket 09). A new serverSeq makes devices pull it.
   */
  mergeStatus(tx: Tx, profileId: string, bookId: string, status: ReadStatus, hlc: string): boolean {
    return this.applyStatus(tx, profileId, { kind: 'readStatus', bookId, status, hlc })
  }

  private applyStatus(
    tx: Tx,
    profileId: string,
    c: Extract<Change, { kind: 'readStatus' }>,
  ): boolean {
    const book = tx.select({ id: books.id }).from(books).where(eq(books.id, c.bookId)).get()
    if (!book) return false
    const existing = tx
      .select({ hlc: readStatus.hlc })
      .from(readStatus)
      .where(and(eq(readStatus.profileId, profileId), eq(readStatus.bookId, c.bookId)))
      .get()
    if (existing && compareHlc(existing.hlc, c.hlc) >= 0) return false
    const row = { status: c.status, hlc: c.hlc, serverSeq: this.nextSeq(tx) }
    tx.insert(readStatus)
      .values({ profileId, bookId: c.bookId, ...row })
      .onConflictDoUpdate({ target: [readStatus.profileId, readStatus.bookId], set: row })
      .run()
    return true
  }

  /**
   * Bookmarks and Highlights are keyed by a client id; an id that belongs to another
   * Profile is never overwritten.
   */
  private applyBookmark(
    tx: Tx,
    profileId: string,
    c: Extract<Change, { kind: 'bookmark' }>,
  ): boolean {
    if (!tx.select({ id: files.id }).from(files).where(eq(files.id, c.fileId)).get()) return false
    const existing = tx.select().from(bookmarks).where(eq(bookmarks.id, c.id)).get()
    if (existing && (existing.profileId !== profileId || compareHlc(existing.hlc, c.hlc) >= 0))
      return false
    const row = {
      cfi: c.cfi,
      snippet: c.snippet,
      deleted: c.deleted,
      hlc: c.hlc,
      serverSeq: this.nextSeq(tx),
    }
    tx.insert(bookmarks)
      .values({ id: c.id, profileId, fileId: c.fileId, ...row })
      .onConflictDoUpdate({ target: bookmarks.id, set: row })
      .run()
    return true
  }

  private applyHighlight(
    tx: Tx,
    profileId: string,
    c: Extract<Change, { kind: 'highlight' }>,
  ): boolean {
    if (!tx.select({ id: files.id }).from(files).where(eq(files.id, c.fileId)).get()) return false
    const existing = tx.select().from(highlights).where(eq(highlights.id, c.id)).get()
    if (existing && (existing.profileId !== profileId || compareHlc(existing.hlc, c.hlc) >= 0))
      return false
    const row = {
      cfiRange: c.cfiRange,
      colour: c.colour,
      text: c.text,
      note: c.note?.trim() ? c.note : null,
      deleted: c.deleted,
      hlc: c.hlc,
      serverSeq: this.nextSeq(tx),
    }
    tx.insert(highlights)
      .values({ id: c.id, profileId, fileId: c.fileId, ...row })
      .onConflictDoUpdate({ target: highlights.id, set: row })
      .run()
    return true
  }

  /** A Profile's live Highlights on a Book's Files, for the Markdown export. */
  highlightsForBook(profileId: string, bookId: string) {
    return this.db
      .select({ h: highlights, format: files.format, fileId: files.id })
      .from(highlights)
      .innerJoin(files, eq(files.id, highlights.fileId))
      .where(
        and(
          eq(highlights.profileId, profileId),
          eq(files.bookId, bookId),
          eq(highlights.deleted, false),
        ),
      )
      .all()
  }
}
