import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod'
import type { Library } from '../books/library.ts'
import type { Db } from '../db/client.ts'
import { AppError } from '../errors.ts'
import { requireProfile } from '../session.ts'
import { LookupError, type OpenLibrary } from './openlibrary.ts'

const ErrorBody = z.object({ error: z.string(), message: z.string() })
const Candidate = z.object({
  key: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  description: z.string().nullable(),
  publisher: z.string().nullable(),
  publishedDate: z.string().nullable(),
  isbn: z.string().nullable(),
  language: z.string().nullable(),
  tags: z.array(z.string()),
  coverId: z.number().nullable(),
})
const CoverId = z.coerce.number().int().positive()

const upstream = (error: unknown) =>
  error instanceof LookupError ? new AppError(502, 'lookup_failed', error.message) : error

/** "Find online" on the Edit metadata form; nothing is applied without the user (ticket 09). */
export function metadataRoutes(
  db: Db,
  library: Library,
  openLibrary: OpenLibrary,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook('onRequest', requireProfile(db))

    app.get(
      '/api/metadata/lookup',
      {
        schema: {
          operationId: 'lookupMetadata',
          querystring: z.object({
            isbn: z.string().max(40).optional(),
            title: z.string().max(500).optional(),
            author: z.string().max(200).optional(),
          }),
          response: { 200: z.object({ candidates: z.array(Candidate) }), 502: ErrorBody },
        },
      },
      async (request) => {
        try {
          return { candidates: await openLibrary.lookup(request.query) }
        } catch (error) {
          throw upstream(error)
        }
      },
    )

    // Previews go through the server: the page may only load images from its own origin.
    app.get(
      '/api/metadata/cover/:coverId',
      {
        schema: {
          operationId: 'previewCover',
          params: z.object({ coverId: CoverId }),
          querystring: z.object({ size: z.enum(['S', 'M', 'L']).default('M') }),
        },
      },
      async (request, reply) => {
        try {
          const cover = await openLibrary.cover(request.params.coverId, request.query.size)
          reply.header('Content-Type', cover.contentType)
          reply.header('Cache-Control', 'private, max-age=86400')
          return reply.send(cover.data)
        } catch (error) {
          throw error instanceof LookupError ? new AppError(404, 'not_found', error.message) : error
        }
      },
    )

    app.put(
      '/api/books/:bookId/cover',
      {
        schema: {
          operationId: 'setCoverFromOpenLibrary',
          params: z.object({ bookId: z.string() }),
          body: z.object({ coverId: CoverId }),
          response: { 204: z.null(), 403: ErrorBody, 404: ErrorBody, 502: ErrorBody },
        },
      },
      async (request, reply) => {
        const book = library.ownedBook(request.profile.id, request.params.bookId)
        let cover: Awaited<ReturnType<OpenLibrary['cover']>>
        try {
          cover = await openLibrary.cover(request.body.coverId, 'L')
        } catch (error) {
          throw upstream(error)
        }
        const ext = cover.contentType.includes('png') ? 'png' : 'jpg'
        library.replaceCover(book, cover.data, ext)
        return reply.code(204).send(null)
      },
    )
  }
}
