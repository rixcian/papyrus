import fs from 'node:fs'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import {
  type BookRow,
  bookAuthors,
  bookShares,
  books,
  files,
  hiddenBooks,
  readStatus,
  shelfBooks,
} from '../db/schema.ts'
import { AppError } from '../errors.ts'
import type { ReadStatus, SyncService, Tx } from '../sync/service.ts'
import { audioExtracted, probeAudio } from './audio.ts'
import type { BlobStore } from './blobs.ts'
import { extract } from './extract.ts'
import type { FileFormat } from './formats.ts'
import type { Ingest } from './ingest.ts'
import type { Library } from './library.ts'
import type { Extracted } from './metadata.ts'

/**
 * Fixing how Files were grouped into Books (ticket 09): merging one of the Profile's Books
 * into another, and splitting a File out into a Book of its own. Reading Progress, Bookmarks
 * and Highlights belong to Files, so they move with them.
 */
export class Reshape {
  private readonly db: Db
  private readonly library: Library
  private readonly ingest: Ingest
  private readonly sync: SyncService
  private readonly blobs: BlobStore

  constructor(deps: {
    db: Db
    library: Library
    ingest: Ingest
    sync: SyncService
    blobs: BlobStore
  }) {
    this.db = deps.db
    this.library = deps.library
    this.ingest = deps.ingest
    this.sync = deps.sync
    this.blobs = deps.blobs
  }

  /**
   * Moves every File of `sourceId` into `targetId` and deletes the source. The target's
   * metadata wins; the source only fills fields the target lacks, its cover included. Every
   * Profile's Read Status (newest wins) and shelf entries carry over.
   */
  merge(profileId: string, sourceId: string, targetId: string): BookRow {
    if (sourceId === targetId) throw new AppError(400, 'same_book', 'Pick a different Book')
    const source = this.library.ownedBook(profileId, sourceId)
    const target = this.library.ownedBook(profileId, targetId)
    const now = Date.now()

    this.db.transaction((tx) => {
      tx.update(files).set({ bookId: target.id }).where(eq(files.bookId, source.id)).run()
      this.copyStatuses(tx, source.id, target.id)
      this.copyShelves(tx, source.id, target.id)

      const patch: Partial<BookRow> = { updatedAt: now }
      for (const key of ['description', 'language', 'publisher', 'publishedDate', 'isbn'] as const)
        if (!target[key] && source[key]) patch[key] = source[key]
      if (!target.seriesName && source.seriesName) {
        patch.seriesName = source.seriesName
        patch.seriesIndex = source.seriesIndex
      }
      tx.update(books).set(patch).where(eq(books.id, target.id)).run()
      const targetHasAuthors = tx
        .select()
        .from(bookAuthors)
        .where(eq(bookAuthors.bookId, target.id))
        .get()
      if (!targetHasAuthors)
        tx.update(bookAuthors)
          .set({ bookId: target.id })
          .where(eq(bookAuthors.bookId, source.id))
          .run()
    })

    // The cover lives on disk, so it moves after the rows are safe.
    const sourceCover = this.library.coverPath(source)
    if (!target.coverExt && source.coverExt && sourceCover && fs.existsSync(sourceCover)) {
      fs.renameSync(sourceCover, this.ingest.coverPath(target.id, source.coverExt))
      this.db.update(books).set({ coverExt: source.coverExt }).where(eq(books.id, target.id)).run()
    }
    this.library.deleteBooks([source.id])
    return this.library.visibleBook(profileId, target.id)
  }

  /**
   * Moves one File into a new Book with the File's own metadata. The new Book keeps the
   * original's Shares, Read Statuses, shelf entries and hidden markers, so nobody loses a
   * File they could read. A Book's only File can't be split off.
   */
  private async audioMetadata(fileId: string, fallbackName: string): Promise<Extracted> {
    const tracks = this.library.tracksOf(fileId)
    const probed = await Promise.all(
      tracks.map((t) => probeAudio(this.blobs.pathFor(t.sha256), t.originalName)),
    )
    return audioExtracted(probed, fallbackName)
  }

  async split(profileId: string, fileId: string): Promise<BookRow> {
    const { file, book } = this.library.visibleFile(profileId, fileId)
    this.library.ownedBook(profileId, book.id)
    if (this.library.filesOf([book.id]).length <= 1)
      throw new AppError(
        409,
        'last_file',
        'This is the Book’s only File; there is nothing to split',
      )

    let extracted: Extracted
    try {
      extracted =
        file.format === 'audio'
          ? await this.audioMetadata(file.id, file.originalName)
          : await extract(
              file.format as FileFormat,
              this.blobs.pathFor(file.sha256),
              file.originalName,
            )
    } catch {
      extracted = this.metadataOf(book)
    }

    const now = Date.now()
    const created = this.db.transaction((tx) => {
      const fresh = this.ingest.createBook(tx, profileId, extracted, now)
      tx.update(files).set({ bookId: fresh.id }).where(eq(files.id, file.id)).run()
      tx.update(books)
        .set({ shareMode: book.shareMode, sharedAt: book.sharedAt })
        .where(eq(books.id, fresh.id))
        .run()
      for (const share of tx.select().from(bookShares).where(eq(bookShares.bookId, book.id)).all())
        tx.insert(bookShares)
          .values({ ...share, bookId: fresh.id })
          .run()
      for (const hidden of tx
        .select()
        .from(hiddenBooks)
        .where(eq(hiddenBooks.bookId, book.id))
        .all())
        tx.insert(hiddenBooks)
          .values({ ...hidden, bookId: fresh.id })
          .run()
      this.copyStatuses(tx, book.id, fresh.id)
      this.copyShelves(tx, book.id, fresh.id)
      return fresh
    })
    if (extracted.cover) this.ingest.saveCover(created.id, extracted.cover)
    return this.library.visibleBook(profileId, created.id)
  }

  private copyStatuses(tx: Tx, fromId: string, toId: string): void {
    for (const row of tx.select().from(readStatus).where(eq(readStatus.bookId, fromId)).all())
      this.sync.mergeStatus(tx, row.profileId, toId, row.status as ReadStatus, row.hlc)
  }

  private copyShelves(tx: Tx, fromId: string, toId: string): void {
    for (const entry of tx.select().from(shelfBooks).where(eq(shelfBooks.bookId, fromId)).all())
      tx.insert(shelfBooks)
        .values({ ...entry, bookId: toId })
        .onConflictDoNothing()
        .run()
  }

  /** When the File can't be read, the split Book starts from the original's metadata. */
  private metadataOf(book: BookRow): Extracted {
    const authors = this.library.authorsOf([book.id]).get(book.id) ?? []
    return {
      metadata: {
        title: book.title,
        authors,
        tags: this.library.tagsOf(book.id),
        ...(book.seriesName && { seriesName: book.seriesName }),
        ...(book.seriesIndex != null && { seriesIndex: book.seriesIndex }),
      },
    }
  }
}
