import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod'
import type { Db } from '../db/client.ts'
import { requireProfile } from '../session.ts'
import { type ImportScanner, profileFolderName } from './scanner.ts'

const ImportRecord = z.object({
  path: z.string(),
  status: z.enum(['created', 'attached', 'duplicate', 'failed']),
  bookId: z.string().nullable(),
  title: z.string().nullable(),
  message: z.string().nullable(),
  at: z.number(),
})

/** Settings → Imports: where to put files, and what happened to them (ticket 09). */
export function importRoutes(
  db: Db,
  scanner: ImportScanner | undefined,
  pollSeconds: number,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook('onRequest', requireProfile(db))
    app.get(
      '/api/imports',
      {
        schema: {
          operationId: 'listImports',
          response: {
            200: z.object({
              enabled: z.boolean(),
              /** The Profile's folder, relative to the import mount. */
              folder: z.string().nullable(),
              pollSeconds: z.number(),
              records: z.array(ImportRecord),
            }),
          },
        },
      },
      async (request) => ({
        enabled: Boolean(scanner),
        folder: scanner ? profileFolderName(request.profile.name) : null,
        pollSeconds,
        records: (scanner?.recent(request.profile.id) ?? []).map((r) => ({
          path: r.path,
          status: r.status as z.infer<typeof ImportRecord>['status'],
          bookId: r.bookId,
          title: r.title,
          message: r.message,
          at: r.at,
        })),
      }),
    )
  }
}
