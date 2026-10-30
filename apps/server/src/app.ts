import path from 'node:path'
import fastifyCookie from '@fastify/cookie'
import fastifyMultipart from '@fastify/multipart'
import fastifySwagger from '@fastify/swagger'
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from '@fastify/type-provider-zod'
import Fastify, { type FastifyInstance } from 'fastify'
import { BlobStore } from './books/blobs.ts'
import { Ingest } from './books/ingest.ts'
import { Library } from './books/library.ts'
import { bookRoutes } from './books/routes.ts'
import type { Config } from './config.ts'
import type { Db } from './db/client.ts'
import { AppError } from './errors.ts'
import { importRoutes } from './imports/routes.ts'
import { ImportScanner } from './imports/scanner.ts'
import { registerSecurityHeaders } from './plugins/security.ts'
import { registerStatic } from './plugins/spa.ts'
import { healthRoutes } from './routes/health.ts'
import { profileRoutes } from './routes/profiles.ts'
import { shelfRoutes } from './shelves/routes.ts'
import { ShelfService } from './shelves/service.ts'
import { syncRoutes } from './sync/routes.ts'
import { SyncService } from './sync/service.ts'

export interface AppDeps {
  config: Config
  db: Db
  /** Polls the import folder once listening; tests drive `importScanner.scan()` themselves. */
  startBackground?: boolean
}

declare module 'fastify' {
  interface FastifyInstance {
    importScanner: ImportScanner | undefined
  }
}

export async function buildApp({
  config,
  db,
  startBackground = true,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 4 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError)
      return reply.code(error.statusCode).send({ error: error.code, message: error.message })
    if (hasZodFastifySchemaValidationErrors(error))
      return reply.code(400).send({ error: 'invalid_request', message: error.message })
    const status = (error as { statusCode?: number }).statusCode
    if (status && status < 500)
      return reply.code(status).send({ error: 'bad_request', message: (error as Error).message })
    request.log.error(error)
    return reply.code(500).send({ error: 'internal', message: 'Something went wrong' })
  })

  await app.register(fastifySwagger, {
    openapi: { info: { title: 'Papyrus', version: '1.0.0' } },
    transform: jsonSchemaTransform,
  })
  await app.register(fastifyCookie)
  await app.register(fastifyMultipart)
  registerSecurityHeaders(app)
  await registerStatic(app, config.publicDir, config.dataDir)

  const blobs = new BlobStore(config.dataDir)
  const coversDir = path.join(config.dataDir, 'covers')
  const ingest = new Ingest(db, blobs, coversDir)
  const library = new Library(db, blobs, coversDir)
  const sync = new SyncService(db)
  const shelves = new ShelfService(db, library)
  const importScanner = config.importDir
    ? new ImportScanner({
        db,
        ingest,
        blobs,
        importDir: config.importDir,
        deleteSource: config.importDeleteSource,
        log: app.log.child({ module: 'imports' }),
      })
    : undefined
  app.decorate('importScanner', importScanner)
  if (importScanner && startBackground)
    app.addHook('onReady', async () => importScanner.start(config.importPollSeconds))
  app.addHook('onClose', async () => importScanner?.stop())

  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger())
  await app.register(healthRoutes)
  await app.register(profileRoutes(db, library, importScanner))
  await app.register(
    bookRoutes({
      db,
      blobs,
      ingest,
      library,
      sync,
      shelves,
      maxUploadBytes: config.maxUploadBytes,
    }),
  )
  await app.register(shelfRoutes(db, shelves))
  await app.register(importRoutes(db, importScanner, config.importPollSeconds))

  await app.register(syncRoutes(db, sync, library))

  return app
}
