import path from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

const NO_CACHE = new Set(['index.html', 'sw.js', 'manifest.webmanifest'])

/**
 * One `@fastify/static` registration: it serves the built web app when there is one,
 * and gives every route `reply.sendFile(name, root)` for covers and Files.
 */
export async function registerStatic(
  app: FastifyInstance,
  publicDir: string | undefined,
  fallbackRoot: string,
) {
  await app.register(fastifyStatic, {
    root: publicDir ?? fallbackRoot,
    serve: Boolean(publicDir),
    wildcard: false,
    index: false,
    setHeaders(res, filePath) {
      if (!publicDir || !filePath.startsWith(publicDir)) return
      const name = path.basename(filePath)
      if (NO_CACHE.has(name)) res.header('Cache-Control', 'no-cache')
      else if (filePath.includes(`${path.sep}assets${path.sep}`))
        res.header('Cache-Control', 'public, max-age=31536000, immutable')
    },
  })

  app.setNotFoundHandler((request, reply) => {
    if (publicDir && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    }
    return reply.code(404).send({ error: 'not_found', message: `${request.method} ${request.url}` })
  })
}
