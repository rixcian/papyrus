import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type BookRow, bookAuthors, books, bookTags, files } from '../db/schema.ts'
import type { BlobStore, StagedFile } from './blobs.ts'
import { extract } from './extract.ts'
import { formatFromFilename } from './formats.ts'
import { type Extracted, matchKey, sortTitle } from './metadata.ts'

export type IngestStatus = 'created' | 'attached' | 'duplicate' | 'failed'

export interface IngestResult {
  status: IngestStatus
  bookId?: string
  title?: string
  message?: string
}

export interface IngestInput {
  profileId: string
  staged: StagedFile
  originalName: string
  /** Metadata from elsewhere (a Calibre `metadata.opf`), used instead of the File's own. */
  extracted?: Extracted | undefined
}

/** Uploads and imports both land here (ticket 09). */
export class Ingest {
  private readonly db: Db
  private readonly blobs: BlobStore
  private readonly coversDir: string

  constructor(db: Db, blobs: BlobStore, coversDir: string) {
    this.db = db
    this.blobs = blobs
    this.coversDir = coversDir
    fs.mkdirSync(coversDir, { recursive: true })
  }

  async ingest({
    profileId,
    staged,
    originalName,
    extracted: given,
  }: IngestInput): Promise<IngestResult> {
    const existing = this.findOwnFileByHash(profileId, staged.sha256)
    if (existing) {
      this.blobs.discard(staged)
      return {
        status: 'duplicate',
        bookId: existing.id,
        title: existing.title,
        message: 'Already in your library',
      }
    }

    const format = formatFromFilename(originalName)
    let extracted: Extracted
    try {
      extracted = given ?? (await extract(format, staged.tempPath, originalName))
    } catch (error) {
      this.blobs.discard(staged)
      return {
        status: 'failed',
        message: `Couldn't read ${originalName}: ${(error as Error).message}`,
      }
    }

    const match = this.findMatch(profileId, format, extracted)
    const now = Date.now()
    this.blobs.commit(staged)

    const book = this.db.transaction((tx) => {
      const target = match ?? this.createBook(tx, profileId, extracted, now)
      if (match) this.fillEmptyFields(tx, match, extracted, now)
      tx.insert(files)
        .values({
          id: randomUUID(),
          bookId: target.id,
          sha256: staged.sha256,
          format,
          originalName,
          size: staged.size,
          addedAt: now,
        })
        .run()
      return target
    })

    if (extracted.cover && !book.coverExt) this.saveCover(book.id, extracted.cover)
    return { status: match ? 'attached' : 'created', bookId: book.id, title: book.title }
  }

  coverPath(bookId: string, ext: string): string {
    return path.join(this.coversDir, `${bookId}.${ext}`)
  }

  saveCover(bookId: string, cover: NonNullable<Extracted['cover']>) {
    fs.writeFileSync(this.coverPath(bookId, cover.ext), cover.data)
    this.db.update(books).set({ coverExt: cover.ext }).where(eq(books.id, bookId)).run()
  }

  private findOwnFileByHash(profileId: string, sha256: string): BookRow | undefined {
    return this.db
      .select({ book: books })
      .from(files)
      .innerJoin(books, eq(files.bookId, books.id))
      .where(and(eq(books.ownerProfileId, profileId), eq(files.sha256, sha256)))
      .get()?.book
  }

  /** ISBN first, then title + first author, among the Profile's Books lacking this format. */
  private findMatch(profileId: string, format: string, extracted: Extracted): BookRow | undefined {
    const { metadata } = extracted
    const withoutFormat = (condition: ReturnType<typeof eq>) =>
      this.db
        .select({ book: books })
        .from(books)
        .leftJoin(files, and(eq(files.bookId, books.id), eq(files.format, format)))
        .where(and(eq(books.ownerProfileId, profileId), condition, isNull(files.id)))
        .orderBy(books.addedAt)
        .get()?.book

    if (metadata.isbn) {
      const byIsbn = withoutFormat(eq(books.isbn, metadata.isbn))
      if (byIsbn) return byIsbn
    }
    if (!metadata.title || metadata.authors.length === 0) return undefined
    return withoutFormat(eq(books.matchKey, matchKey(metadata.title, metadata.authors[0])))
  }

  /** A new Book from extracted metadata; split (ticket 09) uses it too. */
  createBook(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    profileId: string,
    { metadata: m }: Extracted,
    now: number,
  ): BookRow {
    const title = m.title ?? 'Untitled'
    const book = tx
      .insert(books)
      .values({
        id: randomUUID(),
        ownerProfileId: profileId,
        title,
        sortTitle: sortTitle(title),
        description: m.description ?? null,
        language: m.language ?? null,
        publisher: m.publisher ?? null,
        publishedDate: m.publishedDate ?? null,
        isbn: m.isbn ?? null,
        seriesName: m.seriesName ?? null,
        seriesIndex: m.seriesIndex ?? null,
        matchKey: matchKey(title, m.authors[0]),
        addedAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    m.authors.forEach((name, position) => {
      tx.insert(bookAuthors).values({ bookId: book.id, position, name }).run()
    })
    for (const tag of m.tags)
      tx.insert(bookTags).values({ bookId: book.id, tag }).onConflictDoNothing().run()
    return book
  }

  /** An attached File never overwrites metadata; it only fills what is missing (ticket 09). */
  private fillEmptyFields(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    book: BookRow,
    { metadata: m }: Extracted,
    now: number,
  ) {
    const patch: Partial<BookRow> = {}
    if (!book.description && m.description) patch.description = m.description
    if (!book.language && m.language) patch.language = m.language
    if (!book.publisher && m.publisher) patch.publisher = m.publisher
    if (!book.publishedDate && m.publishedDate) patch.publishedDate = m.publishedDate
    if (!book.isbn && m.isbn) patch.isbn = m.isbn
    if (!book.seriesName && m.seriesName) {
      patch.seriesName = m.seriesName
      patch.seriesIndex = m.seriesIndex ?? null
    }
    if (Object.keys(patch).length)
      tx.update(books)
        .set({ ...patch, updatedAt: now })
        .where(eq(books.id, book.id))
        .run()
    const hasAuthors = tx.select().from(bookAuthors).where(eq(bookAuthors.bookId, book.id)).get()
    if (!hasAuthors)
      m.authors.forEach((name, position) => {
        tx.insert(bookAuthors).values({ bookId: book.id, position, name }).run()
      })
  }
}
