import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { FastifyInstance, InjectOptions } from 'fastify'
import { buildApp } from '../app.ts'
import { loadConfig } from '../config.ts'
import { type Db, openDb } from '../db/client.ts'

export interface Harness {
  app: FastifyInstance
  db: Db
  dataDir: string
  close(): Promise<void>
}

/** A fresh app on a temp data dir and a migrated SQLite file. */
export async function createHarness(env: Record<string, string> = {}): Promise<Harness> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-test-'))
  const config = loadConfig({ PAPYRUS_DATA_DIR: dataDir, LOG_LEVEL: 'silent', ...env })
  const db = openDb(path.join(dataDir, 'papyrus.db'))
  const app = await buildApp({ config, db })
  return {
    app,
    db,
    dataDir,
    async close() {
      await app.close()
      db.$client.close()
      fs.rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/** A tiny client that keeps the Active Profile cookie, like one browser would. */
export class Device {
  cookie: string | undefined
  private readonly app: FastifyInstance

  constructor(app: FastifyInstance) {
    this.app = app
  }

  async request(opts: InjectOptions) {
    const res = await this.app.inject({
      ...opts,
      headers: { ...(opts.headers ?? {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
    })
    const set = res.cookies.find((c) => c.name === 'papyrus_profile')
    if (set) this.cookie = set.value ? `papyrus_profile=${set.value}` : undefined
    return res
  }

  async createProfile(name: string, colour = 'blue') {
    const res = await this.request({
      method: 'POST',
      url: '/api/profiles',
      payload: { name, colour },
    })
    if (res.statusCode !== 201) throw new Error(`createProfile failed: ${res.body}`)
    return res.json() as { id: string; name: string; colour: string }
  }
}
