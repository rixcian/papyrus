import path from 'node:path'
import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client.ts'
import { type BookRow, bookAuthors, books, bookTags, profiles } from '../db/schema.ts'
import { AppError, notFound } from '../errors.ts'
import { requireProfile } from '../session.ts'
import { READ_STATUSES, type SyncService } from '../sync/service.ts'
import type { BlobStore } from './blobs.ts'
import { FILE_FORMATS, type FileFormat, READABLE_FORMATS } from './formats.ts'
import type { Ingest } from './ingest.ts'
import type { Library } from './library.ts'
import { matchKey, normaliseIsbn, sortTitle } from './metadata.ts'

const ErrorBody = z.object({ error: z.string(), message: z.string() })
const Format = z.enum(FILE_FORMATS)
const BookParams = z.object({ bookId: z.string() })
const FileParams = z.object({ fileId: z.string() })

const BookSummary = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  seriesName: z.string().nullable(),
  seriesIndex: z.number().nullable(),
  coverUrl: z.string().nullable(),
  formats: z.array(Format),
  owned: z.boolean(),
  addedAt: z.number(),
  readStatus: z.enum(READ_STATUSES),
  /** The File read most recently and how far into it, for resuming and "Continue reading". */
  lastRead: z.object({ fileId: z.string(), fraction: z.number(), at: z.number() }).nullable(),
})

const BookFile = z.object({
  id: z.string(),
  format: Format,
  originalName: z.string(),
  size: z.number(),
  readable: z.boolean(),
  url: z.string(),
  addedAt: z.number(),
})

const BookDetail = BookSummary.omit({ formats: true }).extend({
  formats: z.array(Format),
  description: z.string().nullable(),
  language: z.string().nullable(),
  publisher: z.string().nullable(),
  publishedDate: z.string().nullable(),
  isbn: z.string().nullable(),
  tags: z.array(z.string()),
  ownerName: z.string(),
  files: z.array(BookFile),
  updatedAt: z.number(),
})

/** Blank strings clear a field; `undefined` leaves it alone. */
const OptionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v?.trim() || null))

const BookPatch = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  authors: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  description: OptionalText(20_000),
  language: OptionalText(35),
  publisher: OptionalText(200),
  publishedDate: OptionalText(40),
  isbn: OptionalText(40),
  seriesName: OptionalText(300),
  seriesIndex: z.number().finite().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
})

const IngestResultBody = z.object({
  status: z.enum(['created', 'attached', 'duplicate', 'failed']),
  bookId: z.string().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
})

const CONTENT_TYPES: Record<FileFormat, string> = {
  epub: 'application/epub+zip',
  mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/vnd.amazon.ebook',
  pdf: 'application/pdf',
  cbz: 'application/vnd.comicbook+zip',
  other: 'application/octet-stream',
}

export interface BookRouteDeps {
  db: Db
  blobs: BlobStore
  ingest: Ingest
  library: Library
  sync: SyncService
  maxUploadBytes: number
}

export function bookRoutes({
  db,
  blobs,
  ingest,
  library,
  sync,
  maxUploadBytes,
}: BookRouteDeps): FastifyPluginAsyncZod {
  const coverUrl = (b: BookRow) => (b.coverExt ? `/api/books/${b.id}/cover?v=${b.updatedAt}` : null)

  function readingState(profileId: string, bookIds: string[]) {
    const statuses = sync.statusFor(profileId, bookIds)
    const latest = sync.latestProgress(profileId, bookIds)
    return (bookId: string) => {
      const last = latest.get(bookId)
      return {
        readStatus: statuses.get(bookId) ?? ('unread' as const),
        lastRead: last ? { fileId: last.fileId, fraction: last.fraction, at: last.readAt } : null,
      }
    }
  }

  function detail(profileId: string, book: BookRow): z.infer<typeof BookDetail> {
    const fileRows = library.filesOf([book.id])
    const owner = db
      .select({ name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, book.ownerProfileId))
      .get()
    return {
      id: book.id,
      title: book.title,
      authors: library.authorsOf([book.id]).get(book.id) ?? [],
      seriesName: book.seriesName,
      seriesIndex: book.seriesIndex,
      coverUrl: coverUrl(book),
      owned: book.ownerProfileId === profileId,
      addedAt: book.addedAt,
      description: book.description,
      language: book.language,
      publisher: book.publisher,
      publishedDate: book.publishedDate,
      isbn: book.isbn,
      tags: library.tagsOf(book.id),
      ownerName: owner?.name ?? '',
      updatedAt: book.updatedAt,
      formats: [...new Set(fileRows.map((f) => f.format as FileFormat))],
      ...readingState(profileId, [book.id])(book.id),
      files: fileRows.map((f) => ({
        id: f.id,
        format: f.format as FileFormat,
        originalName: f.originalName,
        size: f.size,
        readable: READABLE_FORMATS.has(f.format as FileFormat),
        url: `/api/files/${f.id}`,
        addedAt: f.addedAt,
      })),
    }
  }

  return async (app) => {
    app.addHook('onRequest', requireProfile(db))

    // One file per request; the client uploads several in parallel (ticket 09).
    app.post(
      '/api/uploads',
      {
        schema: {
          operationId: 'uploadFile',
          consumes: ['multipart/form-data'],
          response: { 200: IngestResultBody, 400: ErrorBody, 413: ErrorBody },
        },
      },
      async (request) => {
        const part = await request.file({ limits: { fileSize: maxUploadBytes, files: 1 } })
        if (!part) throw new AppError(400, 'no_file', 'Send one file in the "file" field')
        const staged = await blobs.stage(part.file)
        if (part.file.truncated) {
          blobs.discard(staged)
          throw new AppError(413, 'too_large', `${part.filename} is larger than the upload limit`)
        }
        return ingest.ingest({ profileId: request.profile.id, staged, originalName: part.filename })
      },
    )

    app.get(
      '/api/books',
      {
        schema: {
          operationId: 'listBooks',
          querystring: z.object({ status: z.enum(READ_STATUSES).optional() }),
          response: { 200: z.object({ books: z.array(BookSummary) }) },
        },
      },
      async (request) => {
        const rows = db
          .select()
          .from(books)
          .where(eq(books.ownerProfileId, request.profile.id))
          .orderBy(desc(books.addedAt))
          .all()
        const ids = rows.map((b) => b.id)
        const authors = library.authorsOf(ids)
        const fileRows = library.filesOf(ids)
        const stateOf = readingState(request.profile.id, ids)
        const summaries = rows.map((b) => ({
          id: b.id,
          title: b.title,
          authors: authors.get(b.id) ?? [],
          seriesName: b.seriesName,
          seriesIndex: b.seriesIndex,
          coverUrl: coverUrl(b),
          formats: [
            ...new Set(
              fileRows.filter((f) => f.bookId === b.id).map((f) => f.format as FileFormat),
            ),
          ],
          owned: b.ownerProfileId === request.profile.id,
          addedAt: b.addedAt,
          ...stateOf(b.id),
        }))
        const { status } = request.query
        return { books: status ? summaries.filter((b) => b.readStatus === status) : summaries }
      },
    )

    app.get(
      '/api/books/:bookId',
      {
        schema: {
          operationId: 'getBook',
          params: BookParams,
          response: { 200: BookDetail, 404: ErrorBody },
        },
      },
      async (request) =>
        detail(request.profile.id, library.visibleBook(request.profile.id, request.params.bookId)),
    )

    app.patch(
      '/api/books/:bookId',
      {
        schema: {
          operationId: 'updateBook',
          params: BookParams,
          body: BookPatch,
          response: { 200: BookDetail, 400: ErrorBody, 403: ErrorBody, 404: ErrorBody },
        },
      },
      async (request) => {
        const book = library.ownedBook(request.profile.id, request.params.bookId)
        const { authors, tags, title, isbn, ...fields } = request.body
        let normalisedIsbn: string | null | undefined = isbn
        if (isbn) {
          normalisedIsbn = normaliseIsbn(isbn)
          if (!normalisedIsbn)
            throw new AppError(400, 'invalid_isbn', `"${isbn}" is not a valid ISBN`)
        }
        const nextTitle = title ?? book.title
        db.transaction((tx) => {
          if (authors) {
            tx.delete(bookAuthors).where(eq(bookAuthors.bookId, book.id)).run()
            authors.forEach((name, position) => {
              tx.insert(bookAuthors).values({ bookId: book.id, position, name }).run()
            })
          }
          if (tags) {
            tx.delete(bookTags).where(eq(bookTags.bookId, book.id)).run()
            for (const tag of new Set(tags))
              tx.insert(bookTags).values({ bookId: book.id, tag }).run()
          }
          const firstAuthor =
            authors?.[0] ??
            tx
              .select({ name: bookAuthors.name })
              .from(bookAuthors)
              .where(eq(bookAuthors.bookId, book.id))
              .orderBy(bookAuthors.position)
              .get()?.name
          const defined = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined),
          )
          tx.update(books)
            .set({
              ...defined,
              ...(normalisedIsbn !== undefined && { isbn: normalisedIsbn }),
              title: nextTitle,
              sortTitle: sortTitle(nextTitle),
              matchKey: matchKey(nextTitle, firstAuthor),
              updatedAt: Date.now(),
            })
            .where(eq(books.id, book.id))
            .run()
        })
        return detail(request.profile.id, library.visibleBook(request.profile.id, book.id))
      },
    )

    app.delete(
      '/api/books/:bookId',
      {
        schema: {
          operationId: 'deleteBook',
          params: BookParams,
          response: { 204: z.null(), 403: ErrorBody, 404: ErrorBody },
        },
      },
      async (request, reply) => {
        const book = library.ownedBook(request.profile.id, request.params.bookId)
        library.deleteBooks([book.id])
        return reply.code(204).send(null)
      },
    )

    app.get(
      '/api/books/:bookId/cover',
      { schema: { operationId: 'getBookCover', params: BookParams } },
      async (request, reply) => {
        const book = library.visibleBook(request.profile.id, request.params.bookId)
        const cover = library.coverPath(book)
        if (!cover) throw notFound('Cover')
        reply.header('Cache-Control', 'private, max-age=86400')
        return reply.sendFile(path.basename(cover), library.coversDir)
      },
    )

    // Range requests come from @fastify/send, so the reader can fetch parts of a File (ticket 04).
    app.get(
      '/api/files/:fileId',
      {
        schema: {
          operationId: 'getFile',
          params: FileParams,
          querystring: z.object({ download: z.enum(['1']).optional() }),
        },
      },
      async (request, reply) => {
        const { file } = library.visibleFile(request.profile.id, request.params.fileId)
        const disposition = request.query.download ? 'attachment' : 'inline'
        reply.header(
          'Content-Type',
          CONTENT_TYPES[file.format as FileFormat] ?? CONTENT_TYPES.other,
        )
        reply.header(
          'Content-Disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        )
        // Bytes behind a File id never change, so the cache can keep them (ticket 05).
        reply.header('Cache-Control', 'private, max-age=31536000, immutable')
        const blob = blobs.pathFor(file.sha256)
        return reply.sendFile(path.basename(blob), path.dirname(blob), {
          cacheControl: false,
          contentType: false,
        })
      },
    )

    app.get(
      '/api/files/:fileId/info',
      {
        schema: {
          operationId: 'getFileInfo',
          params: FileParams,
          response: {
            200: z.object({
              id: z.string(),
              bookId: z.string(),
              title: z.string(),
              format: Format,
              readable: z.boolean(),
              url: z.string(),
            }),
            404: ErrorBody,
          },
        },
      },
      async (request) => {
        const { file, book } = library.visibleFile(request.profile.id, request.params.fileId)
        return {
          id: file.id,
          bookId: book.id,
          title: book.title,
          format: file.format as FileFormat,
          readable: READABLE_FORMATS.has(file.format as FileFormat),
          url: `/api/files/${file.id}`,
        }
      },
    )

    app.delete(
      '/api/files/:fileId',
      {
        schema: {
          operationId: 'deleteFile',
          params: FileParams,
          response: { 204: z.null(), 403: ErrorBody, 404: ErrorBody, 409: ErrorBody },
        },
      },
      async (request, reply) => {
        library.removeFile(request.profile.id, request.params.fileId)
        return reply.code(204).send(null)
      },
    )
  }
}
