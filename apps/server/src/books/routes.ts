import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client.ts'
import { bookAuthors, books, files } from '../db/schema.ts'
import { AppError, notFound } from '../errors.ts'
import { requireProfile } from '../session.ts'
import type { BlobStore } from './blobs.ts'
import { FILE_FORMATS } from './formats.ts'
import type { Ingest } from './ingest.ts'

const ErrorBody = z.object({ error: z.string(), message: z.string() })

const BookSummary = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  seriesName: z.string().nullable(),
  seriesIndex: z.number().nullable(),
  coverUrl: z.string().nullable(),
  formats: z.array(z.enum(FILE_FORMATS)),
  owned: z.boolean(),
  addedAt: z.number(),
})

const IngestResultBody = z.object({
  status: z.enum(['created', 'attached', 'duplicate', 'failed']),
  bookId: z.string().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
})

export interface BookRouteDeps {
  db: Db
  blobs: BlobStore
  ingest: Ingest
  coversDir: string
  maxUploadBytes: number
}

export function bookRoutes({
  db,
  blobs,
  ingest,
  coversDir,
  maxUploadBytes,
}: BookRouteDeps): FastifyPluginAsyncZod {
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
        const authors = ids.length
          ? db
              .select()
              .from(bookAuthors)
              .where(inArray(bookAuthors.bookId, ids))
              .orderBy(asc(bookAuthors.position))
              .all()
          : []
        const fileRows = ids.length
          ? db
              .select({ bookId: files.bookId, format: files.format })
              .from(files)
              .where(inArray(files.bookId, ids))
              .all()
          : []
        return {
          books: rows.map((b) => ({
            id: b.id,
            title: b.title,
            authors: authors.filter((a) => a.bookId === b.id).map((a) => a.name),
            seriesName: b.seriesName,
            seriesIndex: b.seriesIndex,
            coverUrl: b.coverExt ? `/api/books/${b.id}/cover?v=${b.updatedAt}` : null,
            formats: [
              ...new Set(fileRows.filter((f) => f.bookId === b.id).map((f) => f.format)),
            ] as (typeof FILE_FORMATS)[number][],
            owned: b.ownerProfileId === request.profile.id,
            addedAt: b.addedAt,
          })),
        }
      },
    )

    app.get(
      '/api/books/:bookId/cover',
      { schema: { operationId: 'getBookCover', params: z.object({ bookId: z.string() }) } },
      async (request, reply) => {
        const book = db
          .select()
          .from(books)
          .where(
            and(eq(books.id, request.params.bookId), eq(books.ownerProfileId, request.profile.id)),
          )
          .get()
        if (!book?.coverExt) throw notFound('Cover')
        reply.header('Cache-Control', 'private, max-age=86400')
        return reply.sendFile(`${book.id}.${book.coverExt}`, coversDir)
      },
    )
  }
}
