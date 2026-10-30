import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.ts'

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

/** Next to the source in development, next to the bundle in the image. */
function defaultMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [path.join(here, '../../drizzle'), path.join(here, '../drizzle')]
  const dev = candidates[0] as string
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'meta/_journal.json'))) ?? dev
}

export function openDb(file: string, migrationsDir = defaultMigrationsDir()): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: migrationsDir })
  return db
}
