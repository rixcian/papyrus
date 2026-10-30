import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod'
import type { Db } from '../db/client.ts'
import { requireProfile } from '../session.ts'
import { SHELF_NAME_MAX, type ShelfService } from './service.ts'

const ErrorBody = z.object({ error: z.string(), message: z.string() })
const Shelf = z.object({ id: z.string(), name: z.string(), count: z.number() })
const ShelfParams = z.object({ shelfId: z.string() })
const ShelfName = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(SHELF_NAME_MAX))
const BookIds = z.array(z.string()).max(1000).default([])

export function shelfRoutes(db: Db, shelves: ShelfService): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook('onRequest', requireProfile(db))

    app.get(
      '/api/shelves',
      {
        schema: {
          operationId: 'listShelves',
          response: { 200: z.object({ shelves: z.array(Shelf) }) },
        },
      },
      async (request) => ({ shelves: shelves.list(request.profile.id) }),
    )

    app.post(
      '/api/shelves',
      {
        schema: {
          operationId: 'createShelf',
          body: z.object({ name: ShelfName }),
          response: { 201: Shelf, 400: ErrorBody, 409: ErrorBody },
        },
      },
      async (request, reply) =>
        reply.code(201).send(shelves.create(request.profile.id, request.body.name)),
    )

    app.patch(
      '/api/shelves/:shelfId',
      {
        schema: {
          operationId: 'renameShelf',
          params: ShelfParams,
          body: z.object({ name: ShelfName }),
          response: { 200: Shelf, 400: ErrorBody, 404: ErrorBody, 409: ErrorBody },
        },
      },
      async (request) =>
        shelves.rename(request.profile.id, request.params.shelfId, request.body.name),
    )

    app.delete(
      '/api/shelves/:shelfId',
      {
        schema: {
          operationId: 'deleteShelf',
          params: ShelfParams,
          response: { 204: z.null(), 404: ErrorBody },
        },
      },
      async (request, reply) => {
        shelves.delete(request.profile.id, request.params.shelfId)
        return reply.code(204).send(null)
      },
    )

    app.post(
      '/api/shelves/:shelfId/books',
      {
        schema: {
          operationId: 'updateShelfBooks',
          params: ShelfParams,
          body: z.object({ add: BookIds, remove: BookIds }),
          response: { 200: Shelf, 404: ErrorBody },
        },
      },
      async (request) =>
        shelves.update(
          request.profile.id,
          request.params.shelfId,
          request.body.add,
          request.body.remove,
        ),
    )
  }
}
