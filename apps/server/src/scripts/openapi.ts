// Writes the server's OpenAPI document, which the web app's typed client is generated from.
import fs from 'node:fs'
import { buildApp } from '../app.ts'
import { loadConfig } from '../config.ts'
import { openDb } from '../db/client.ts'

const out = process.argv[2]
if (!out) throw new Error('usage: openapi.ts <out.json>')
const app = await buildApp({
  config: { ...loadConfig({}), logLevel: 'silent' },
  db: openDb(':memory:'),
})
await app.ready()
fs.writeFileSync(out, `${JSON.stringify(app.swagger(), null, 2)}\n`)
await app.close()
