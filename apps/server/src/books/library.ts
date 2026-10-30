import fs from 'node:fs'
import path from 'node:path'
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import {
  type BookRow,
  bookAuthors,
  bookShares,
  books,
  bookTags,
  type FileRow,
  files,
  hiddenBooks,
  profiles,
} from '../db/schema.ts'
import { AppError, notFound } from '../errors.ts'
import type { BlobStore } from './blobs.ts'
import { ADDED_SQL, HIDDEN_SQL, IN_LIBRARY_SQL, VISIBLE_SQL } from './visibility.ts'

export const SHARE_MODES = ['none', 'everyone', 'named'] as const
export type ShareMode = (typeof SHARE_MODES)[number]

export interface ShareState {
  mode: ShareMode
  /** Named Recipients; empty unless `mode` is `named`. */
  profiles: { id: string; name: string }[]
}

/**
 * Finding, reading and deleting Books on behalf of a Profile. Who may see a Book lives
 * here, so every route answers the same way (ticket 06).
 */
export class Library {
  private readonly db: Db
  private readonly blobs: BlobStore
  readonly coversDir: string

  constructor(db: Db, blobs: BlobStore, coversDir: string) {
    this.db = db
    this.blobs = blobs
    this.coversDir = coversDir
  }

  /**
   * A Book the Profile can see: its own or Shared with it, hidden or not. 404 otherwise, so
   * private Books don't leak their existence.
   */
  visibleBook(profileId: string, bookId: string): BookRow {
    const visible = this.db.$client
      .prepare(`SELECT 1 FROM books b WHERE b.id = @bookId AND ${VISIBLE_SQL}`)
      .get({ bookId, profileId })
    const book = visible
      ? this.db.select().from(books).where(eq(books.id, bookId)).get()
      : undefined
    if (!book) throw notFound('Book')
    return book
  }

  /** When the Book was added as this Profile sees it: for a Shared Book, when it was Shared. */
  addedAt(profileId: string, bookId: string): number | undefined {
    const row = this.db.$client
      .prepare(`SELECT ${ADDED_SQL} AS addedAt FROM books b WHERE b.id = @bookId`)
      .get({ bookId, profileId }) as { addedAt: number | null } | undefined
    return row?.addedAt ?? undefined
  }

  profileNames(ids: string[]): Map<string, string> {
    if (!ids.length) return new Map()
    const rows = this.db
      .select({ id: profiles.id, name: profiles.name })
      .from(profiles)
      .where(inArray(profiles.id, [...new Set(ids)]))
      .all()
    return new Map(rows.map((r) => [r.id, r.name]))
  }

  /** Which of these Books are in the Profile's library: visible and not hidden. */
  inLibrary(profileId: string, bookIds: string[]): Set<string> {
    if (!bookIds.length) return new Set()
    const rows = this.db.$client
      .prepare(
        `SELECT b.id AS id FROM books b JOIN json_each(@ids) j ON j.value = b.id
         WHERE ${IN_LIBRARY_SQL}`,
      )
      .all({ profileId, ids: JSON.stringify(bookIds) }) as { id: string }[]
    return new Set(rows.map((r) => r.id))
  }

  isHidden(profileId: string, bookId: string): boolean {
    return Boolean(
      this.db.$client
        .prepare(`SELECT 1 FROM books b WHERE b.id = @bookId AND ${HIDDEN_SQL}`)
        .get({ bookId, profileId }),
    )
  }

  /**
   * "Remove from my library" for a Recipient. The marker outlives a revoke, so a re-Shared
   * Book stays hidden until the Recipient unhides it (ticket 06).
   */
  setHidden(profileId: string, bookId: string, hidden: boolean): void {
    const book = this.visibleBook(profileId, bookId)
    if (book.ownerProfileId === profileId)
      throw new AppError(409, 'own_book', 'Only Books Shared with you can be hidden')
    if (hidden)
      this.db
        .insert(hiddenBooks)
        .values({ profileId, bookId, hiddenAt: Date.now() })
        .onConflictDoNothing()
        .run()
    else
      this.db
        .delete(hiddenBooks)
        .where(and(eq(hiddenBooks.profileId, profileId), eq(hiddenBooks.bookId, bookId)))
        .run()
  }

  shareOf(book: Pick<BookRow, 'id' | 'shareMode'>): ShareState {
    const mode = book.shareMode as ShareMode
    if (mode !== 'named') return { mode, profiles: [] }
    const named = this.db
      .select({ id: profiles.id, name: profiles.name })
      .from(bookShares)
      .innerJoin(profiles, eq(profiles.id, bookShares.profileId))
      .where(eq(bookShares.bookId, book.id))
      .orderBy(asc(profiles.nameKey))
      .all()
    // Every named Recipient may have deleted their Profile since.
    return named.length ? { mode, profiles: named } : { mode: 'none', profiles: [] }
  }

  /**
   * Sets who a Book is Shared with; only the Owning Profile may. Recipients who stay keep
   * the time they were first Shared it, which is when it counts as added for them. Taking a
   * Share away keeps the Recipient's reading state, hidden until it is Shared again.
   */
  setShare(profileId: string, bookId: string, mode: ShareMode, profileIds: string[]): ShareState {
    const book = this.ownedBook(profileId, bookId)
    const ids = [...new Set(profileIds)].filter((id) => id !== profileId)
    const effective: ShareMode = mode === 'named' && ids.length === 0 ? 'none' : mode
    if (effective === 'named') {
      const known = this.db
        .select({ id: profiles.id })
        .from(profiles)
        .where(inArray(profiles.id, ids))
        .all()
      if (known.length !== ids.length)
        throw new AppError(400, 'unknown_profile', 'One of those Profiles no longer exists')
    }
    const now = Date.now()
    this.db.transaction((tx) => {
      const keep = effective === 'named' ? ids : []
      tx.delete(bookShares)
        .where(
          keep.length
            ? and(eq(bookShares.bookId, book.id), notInArray(bookShares.profileId, keep))
            : eq(bookShares.bookId, book.id),
        )
        .run()
      for (const id of keep)
        tx.insert(bookShares)
          .values({ bookId: book.id, profileId: id, sharedAt: now })
          .onConflictDoNothing()
          .run()
      tx.update(books)
        .set({
          shareMode: effective,
          sharedAt:
            effective === 'everyone' ? (book.shareMode === 'everyone' ? book.sharedAt : now) : null,
        })
        .where(eq(books.id, book.id))
        .run()
    })
    return this.shareOf({ id: book.id, shareMode: effective })
  }

  /** A Book the Profile owns; only the Owning Profile may change it (GLOSSARY: Owning Profile). */
  ownedBook(profileId: string, bookId: string): BookRow {
    const book = this.visibleBook(profileId, bookId)
    if (book.ownerProfileId !== profileId)
      throw new AppError(403, 'not_owner', 'Only the Profile that added this Book can change it')
    return book
  }

  visibleFile(profileId: string, fileId: string): { file: FileRow; book: BookRow } {
    const file = this.db.select().from(files).where(eq(files.id, fileId)).get()
    if (!file) throw notFound('File')
    return { file, book: this.visibleBook(profileId, file.bookId) }
  }

  authorsOf(bookIds: string[]): Map<string, string[]> {
    const out = new Map<string, string[]>()
    if (!bookIds.length) return out
    const rows = this.db
      .select()
      .from(bookAuthors)
      .where(inArray(bookAuthors.bookId, bookIds))
      .orderBy(asc(bookAuthors.position))
      .all()
    for (const r of rows) out.set(r.bookId, [...(out.get(r.bookId) ?? []), r.name])
    return out
  }

  tagsOf(bookId: string): string[] {
    return this.db
      .select({ tag: bookTags.tag })
      .from(bookTags)
      .where(eq(bookTags.bookId, bookId))
      .orderBy(asc(bookTags.tag))
      .all()
      .map((r) => r.tag)
  }

  filesOf(bookIds: string[]): FileRow[] {
    if (!bookIds.length) return []
    return this.db
      .select()
      .from(files)
      .where(inArray(files.bookId, bookIds))
      .orderBy(asc(files.addedAt))
      .all()
  }

  coverPath(book: Pick<BookRow, 'id' | 'coverExt'>): string | undefined {
    return book.coverExt ? path.join(this.coversDir, `${book.id}.${book.coverExt}`) : undefined
  }

  /** A new cover from elsewhere; the old file goes, and the cover URL changes with it. */
  replaceCover(book: BookRow, data: Buffer, ext: string): void {
    const old = this.coverPath(book)
    if (old) fs.rmSync(old, { force: true })
    fs.mkdirSync(this.coversDir, { recursive: true })
    fs.writeFileSync(path.join(this.coversDir, `${book.id}.${ext}`), data)
    this.db
      .update(books)
      .set({ coverExt: ext, updatedAt: Date.now() })
      .where(eq(books.id, book.id))
      .run()
  }

  /**
   * Deleting a Book removes it for every Profile, with all reading state on it (ticket 06).
   * Blobs go only when no other File still points at the same bytes.
   */
  deleteBooks(bookIds: string[]): void {
    if (!bookIds.length) return
    const doomed = this.db.select().from(books).where(inArray(books.id, bookIds)).all()
    const shas = this.filesOf(bookIds).map((f) => f.sha256)
    this.db.delete(books).where(inArray(books.id, bookIds)).run()
    for (const book of doomed) {
      const cover = this.coverPath(book)
      if (cover) fs.rmSync(cover, { force: true })
    }
    this.collectBlobs(shas)
  }

  /** Every Book a Profile owns; used when the Profile is deleted. */
  booksOwnedBy(profileId: string): string[] {
    return this.db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.ownerProfileId, profileId))
      .all()
      .map((b) => b.id)
  }

  /**
   * Removing a File deletes every Profile's reading state on it (ticket 08). The last File
   * can't be removed; delete the Book instead.
   */
  removeFile(profileId: string, fileId: string): void {
    const { file, book } = this.visibleFile(profileId, fileId)
    this.ownedBook(profileId, book.id)
    const count = this.db
      .select({ id: files.id })
      .from(files)
      .where(eq(files.bookId, book.id))
      .all().length
    if (count <= 1)
      throw new AppError(409, 'last_file', 'This is the Book’s only File; delete the Book instead')
    this.db
      .delete(files)
      .where(and(eq(files.id, file.id), eq(files.bookId, book.id)))
      .run()
    this.collectBlobs([file.sha256])
  }

  private collectBlobs(shas: string[]): void {
    for (const sha of new Set(shas)) {
      const stillUsed = this.db
        .select({ id: files.id })
        .from(files)
        .where(eq(files.sha256, sha))
        .get()
      if (!stillUsed) this.blobs.remove(sha)
    }
  }
}
