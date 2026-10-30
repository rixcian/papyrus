import fs from 'node:fs'
import path from 'node:path'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { type BookRow, bookAuthors, books, bookTags, type FileRow, files } from '../db/schema.ts'
import { AppError, notFound } from '../errors.ts'
import type { BlobStore } from './blobs.ts'

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

  /** A Book the Profile can see; 404 otherwise, so private Books don't leak their existence. */
  visibleBook(profileId: string, bookId: string): BookRow {
    const book = this.db.select().from(books).where(eq(books.id, bookId)).get()
    if (!book || book.ownerProfileId !== profileId) throw notFound('Book')
    return book
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
