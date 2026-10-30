import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Library } from '../books/library.ts'
import type { Db } from '../db/client.ts'
import { profiles } from '../db/schema.ts'
import { AppError } from '../errors.ts'
import { requireProfile } from '../session.ts'
import { READ_STATUSES, type SyncService } from './service.ts'

const ErrorBody = z.object({ error: z.string(), message: z.string() })
const Status = z.enum(READ_STATUSES)

const ChangeBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('progress'),
    fileId: z.string(),
    cfi: z.string().min(1).max(2000),
    fraction: z.number().finite(),
    hlc: z.string().max(200),
  }),
  z.object({
    kind: z.literal('readStatus'),
    bookId: z.string(),
    status: Status,
    hlc: z.string().max(200),
  }),
])

const RecordBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('progress'),
    fileId: z.string(),
    bookId: z.string(),
    cfi: z.string(),
    fraction: z.number(),
    deviceId: z.string(),
    hlc: z.string(),
  }),
  z.object({ kind: z.literal('readStatus'), bookId: z.string(), status: Status, hlc: z.string() }),
])

export function syncRoutes(db: Db, sync: SyncService, library: Library): FastifyPluginAsyncZod {
  return async (app) => {
    // The outbox may hold changes from a Profile that is no longer active on this device,
    // so the Profile comes from the body, not the cookie (ticket 08).
    app.post(
      '/api/sync',
      {
        schema: {
          operationId: 'sync',
          body: z.object({
            profileId: z.string(),
            deviceId: z.string().min(1).max(100),
            cursor: z.number().int().nonnegative(),
            changes: z.array(ChangeBody).max(5000),
          }),
          response: {
            200: z.object({
              applied: z.number(),
              cursor: z.number(),
              records: z.array(RecordBody),
            }),
            410: ErrorBody,
          },
        },
      },
      async (request) => {
        const { profileId, deviceId, cursor, changes } = request.body
        const exists = db
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.id, profileId))
          .get()
        if (!exists) throw new AppError(410, 'profile_gone', 'This Profile has been deleted')
        const { applied } = sync.apply(profileId, deviceId, changes)
        return { applied, ...sync.pull(profileId, cursor) }
      },
    )

    const scoped: FastifyPluginAsyncZod = async (s) => {
      s.addHook('onRequest', requireProfile(db))
      s.get(
        '/api/files/:fileId/state',
        {
          schema: {
            operationId: 'getFileState',
            params: z.object({ fileId: z.string() }),
            response: {
              200: z.object({
                progress: z
                  .object({
                    cfi: z.string(),
                    fraction: z.number(),
                    deviceId: z.string(),
                    hlc: z.string(),
                  })
                  .nullable(),
                readStatus: Status,
              }),
              404: ErrorBody,
            },
          },
        },
        async (request) => {
          const { file, book } = library.visibleFile(request.profile.id, request.params.fileId)
          const p = sync.progressFor(request.profile.id, file.id)
          return {
            progress: p
              ? { cfi: p.cfi, fraction: p.fraction, deviceId: p.deviceId, hlc: p.hlc }
              : null,
            readStatus: sync.statusFor(request.profile.id, [book.id]).get(book.id) ?? 'unread',
          }
        },
      )
    }
    await app.register(scoped)
  }
}
