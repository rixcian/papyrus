import path from 'node:path'
import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db/client.ts'

const config = loadConfig()
const db = openDb(path.join(config.dataDir, 'papyrus.db'))
const app = await buildApp({ config, db })

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  db.$client.close()
  process.exit(0)
}
process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

await app.listen({ port: config.port, host: config.host })
