import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { TRANSLATE_TARGET_CODES, TRANSLATE_TEXT_MAX } from '@papyrus/shared'
import { z } from 'zod'
import type { Db } from '../db/client.ts'
import { AppError } from '../errors.ts'
import { requireProfile } from '../session.ts'
import { type DeepL, TranslateError } from './deepl.ts'

const ErrorBody = z.object({ error: z.string(), message: z.string() })

/** Translating a selection in the reader; on only when a DeepL key is configured. */
export function translateRoutes(db: Db, deepl: DeepL | undefined): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook('onRequest', requireProfile(db))

    app.get(
      '/api/translate/status',
      {
        schema: {
          operationId: 'translateStatus',
          response: { 200: z.object({ enabled: z.boolean() }) },
        },
      },
      async () => ({ enabled: Boolean(deepl) }),
    )

    app.post(
      '/api/translate',
      {
        schema: {
          operationId: 'translate',
          body: z.object({
            text: z.string().trim().min(1).max(TRANSLATE_TEXT_MAX),
            target: z.enum(TRANSLATE_TARGET_CODES),
          }),
          response: {
            200: z.object({ text: z.string(), detectedSource: z.string().nullable() }),
            502: ErrorBody,
            503: ErrorBody,
          },
        },
      },
      async (request) => {
        if (!deepl)
          throw new AppError(503, 'translation_off', 'Translation isn’t set up on this server')
        try {
          return await deepl.translate(request.body.text, request.body.target)
        } catch (error) {
          if (error instanceof TranslateError)
            throw new AppError(error.status, 'translation_failed', error.message)
          throw error
        }
      },
    )
  }
}
