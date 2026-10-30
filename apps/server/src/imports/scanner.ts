import fs from 'node:fs'
import path from 'node:path'
import { and, desc, eq } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import type { BlobStore } from '../books/blobs.ts'
import { opfMetadata } from '../books/epub.ts'
import type { Ingest, IngestResult } from '../books/ingest.ts'
import type { Extracted } from '../books/metadata.ts'
import type { Db } from '../db/client.ts'
import { type ImportRecordRow, importRecords, type ProfileRow, profiles } from '../db/schema.ts'

const CALIBRE_OPF = 'metadata.opf'
const CALIBRE_COVER = 'cover.jpg'
const MAX_COVER_BYTES = 15 * 1024 * 1024
/** Names that are never books: OS litter and files still being written. */
const IGNORED = /^(\..*|thumbs\.db|desktop\.ini)$|\.(part|crdownload|download|tmp|partial)$/i

/** A Profile's folder name: its name, made safe for a path. */
export function profileFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|\p{Cc}]/gu, '_').replace(/^\.+/, '_')
}
const folderKey = (name: string) => name.toLocaleLowerCase('en')

export interface ImportScannerOptions {
  db: Db
  ingest: Ingest
  blobs: BlobStore
  importDir: string
  deleteSource: boolean
  log: FastifyBaseLogger
}

interface Candidate {
  abs: string
  /** Relative to the Profile's folder, with forward slashes. */
  rel: string
  size: number
  mtimeMs: number
}

/**
 * The import folder (ticket 09): `<importDir>/<Profile name>/…` is polled, and a file is
 * imported once its size and mtime have stayed the same across two scans, one file at a
 * time, through the same ingest as uploads.
 */
export class ImportScanner {
  private readonly db: Db
  private readonly ingest: Ingest
  private readonly blobs: BlobStore
  private readonly log: FastifyBaseLogger
  readonly importDir: string
  private readonly deleteSource: boolean
  /** Files seen in the last scan and not yet imported: path → "size:mtime". */
  private readonly pending = new Map<string, string>()
  /** Paths already reported as outside any Profile folder, so the log isn't flooded. */
  private readonly warned = new Set<string>()
  private running: Promise<void> | undefined
  private timer: NodeJS.Timeout | undefined

  constructor(options: ImportScannerOptions) {
    this.db = options.db
    this.ingest = options.ingest
    this.blobs = options.blobs
    this.log = options.log
    this.importDir = options.importDir
    this.deleteSource = options.deleteSource
  }

  start(pollSeconds: number): void {
    for (const p of this.db.select().from(profiles).all()) this.ensureFolder(p.name)
    this.timer = setInterval(() => void this.scan(), pollSeconds * 1000)
    void this.scan()
  }

  async stop(): Promise<void> {
    clearInterval(this.timer)
    await this.running
  }

  folderFor(name: string): string {
    return path.join(this.importDir, profileFolderName(name))
  }

  /** Best effort: a read-only mount or a clash only gets logged. */
  ensureFolder(name: string): void {
    try {
      fs.mkdirSync(this.folderFor(name), { recursive: true })
    } catch (error) {
      this.log.warn({ err: error, profile: name }, 'could not create import folder')
    }
  }

  renameFolder(from: string, to: string): void {
    const source = this.folderFor(from)
    const target = this.folderFor(to)
    if (source === target) return
    try {
      // Only a case change on a case-insensitive disk lands on an existing target.
      if (fs.existsSync(source) && (!fs.existsSync(target) || folderKey(from) === folderKey(to)))
        fs.renameSync(source, target)
      else this.ensureFolder(to)
    } catch (error) {
      this.log.warn({ err: error, from, to }, 'could not rename import folder')
    }
  }

  recent(profileId: string, limit = 100): ImportRecordRow[] {
    return this.db
      .select()
      .from(importRecords)
      .where(eq(importRecords.profileId, profileId))
      .orderBy(desc(importRecords.at))
      .limit(limit)
      .all()
  }

  /** One pass over the import folder. Overlapping calls share the running pass. */
  scan(): Promise<void> {
    this.running ??= this.scanOnce().finally(() => {
      this.running = undefined
    })
    return this.running
  }

  private async scanOnce(): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(this.importDir, { withFileTypes: true })
    } catch (error) {
      this.log.warn({ err: error, dir: this.importDir }, 'import folder is not readable')
      return
    }
    const byFolder = new Map(
      this.db
        .select()
        .from(profiles)
        .all()
        .map((p) => [folderKey(profileFolderName(p.name)), p]),
    )
    for (const entry of entries) {
      if (IGNORED.test(entry.name)) continue
      const profile = entry.isDirectory() ? byFolder.get(folderKey(entry.name)) : undefined
      if (!profile) {
        this.warnOnce(
          entry.name,
          'outside any Profile folder; put books in <import>/<Profile name>/',
        )
        continue
      }
      await this.scanProfile(profile, path.join(this.importDir, entry.name))
    }
  }

  private async scanProfile(profile: ProfileRow, root: string): Promise<void> {
    for (const file of this.walk(root, '')) {
      const signature = `${file.size}:${file.mtimeMs}`
      const record = this.db
        .select()
        .from(importRecords)
        .where(and(eq(importRecords.profileId, profile.id), eq(importRecords.path, file.rel)))
        .get()
      if (record && record.size === file.size && record.mtimeMs === file.mtimeMs) {
        this.pending.delete(file.abs)
        continue
      }
      // Seen for the first time, or still changing: wait for the next scan.
      if (this.pending.get(file.abs) !== signature) {
        this.pending.set(file.abs, signature)
        continue
      }
      this.pending.delete(file.abs)
      await this.importFile(profile, root, file)
    }
  }

  private *walk(root: string, rel: string): Generator<Candidate> {
    const dir = path.join(root, rel)
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    const calibre = entries.some((e) => e.isFile() && e.name === CALIBRE_OPF)
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (IGNORED.test(entry.name)) continue
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        yield* this.walk(root, childRel)
        continue
      }
      if (!entry.isFile()) continue
      if (calibre && (entry.name === CALIBRE_OPF || entry.name === CALIBRE_COVER)) continue
      const abs = path.join(dir, entry.name)
      try {
        const stat = fs.statSync(abs)
        yield { abs, rel: childRel, size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs) }
      } catch {
        // Vanished between listing and stat.
      }
    }
  }

  private async importFile(profile: ProfileRow, root: string, file: Candidate): Promise<void> {
    const dir = path.dirname(file.abs)
    let result: IngestResult
    try {
      const extracted = this.calibreMetadata(dir)
      const staged = await this.blobs.stageFile(file.abs)
      result = await this.ingest.ingest({
        profileId: profile.id,
        staged,
        originalName: path.basename(file.abs),
        extracted,
      })
    } catch (error) {
      result = { status: 'failed', message: `Couldn't import: ${(error as Error).message}` }
    }

    const record = {
      size: file.size,
      mtimeMs: file.mtimeMs,
      status: result.status,
      bookId: result.bookId ?? null,
      title: result.title ?? null,
      message: result.message ?? null,
      at: Date.now(),
    }
    this.db
      .insert(importRecords)
      .values({ profileId: profile.id, path: file.rel, ...record })
      .onConflictDoUpdate({ target: [importRecords.profileId, importRecords.path], set: record })
      .run()
    this.log.info(
      { profile: profile.name, path: file.rel, status: result.status, message: result.message },
      'imported file',
    )

    if (this.deleteSource && result.status !== 'failed') this.removeSource(root, file.abs)
  }

  /** A Calibre book folder: one Book, with the OPF's metadata and cover.jpg (ticket 09). */
  private calibreMetadata(dir: string): Extracted | undefined {
    const opf = path.join(dir, CALIBRE_OPF)
    if (!fs.existsSync(opf)) return undefined
    const extracted: Extracted = { metadata: opfMetadata(fs.readFileSync(opf)) }
    const cover = path.join(dir, CALIBRE_COVER)
    if (fs.existsSync(cover) && fs.statSync(cover).size <= MAX_COVER_BYTES)
      extracted.cover = { data: fs.readFileSync(cover), ext: 'jpg' }
    return extracted
  }

  /** Deletes the source; a Calibre folder left with only its OPF and cover goes too. */
  private removeSource(root: string, abs: string): void {
    try {
      fs.rmSync(abs, { force: true })
      const dir = path.dirname(abs)
      if (dir === root) return
      const left = fs.readdirSync(dir).filter((n) => n !== CALIBRE_OPF && n !== CALIBRE_COVER)
      if (left.length === 0 && fs.existsSync(path.join(dir, CALIBRE_OPF)))
        fs.rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      this.log.warn({ err: error, path: abs }, 'could not delete imported source file')
    }
  }

  private warnOnce(name: string, message: string): void {
    if (this.warned.has(name)) return
    this.warned.add(name)
    this.log.warn({ path: name }, message)
  }
}
