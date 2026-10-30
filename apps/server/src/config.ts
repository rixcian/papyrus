import path from 'node:path'
import { z } from 'zod'

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1')

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  PAPYRUS_DATA_DIR: z.string().default('./.data'),
  PAPYRUS_PUBLIC_DIR: z.string().optional(),
  PAPYRUS_IMPORT_DIR: z.string().optional(),
  PAPYRUS_IMPORT_POLL_SECONDS: z.coerce.number().int().positive().default(30),
  PAPYRUS_IMPORT_DELETE_SOURCE: bool.default(false),
  PAPYRUS_MAX_UPLOAD_MB: z.coerce.number().int().positive().default(500),
  PAPYRUS_TRUST_PROXY: bool.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export interface Config {
  port: number
  host: string
  dataDir: string
  /** The built web app; unset in development, where Vite serves it. */
  publicDir: string | undefined
  importDir: string | undefined
  importPollSeconds: number
  importDeleteSource: boolean
  maxUploadBytes: number
  trustProxy: boolean
  logLevel: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = EnvSchema.parse(env)
  return {
    port: e.PORT,
    host: e.HOST,
    dataDir: path.resolve(e.PAPYRUS_DATA_DIR),
    publicDir: e.PAPYRUS_PUBLIC_DIR ? path.resolve(e.PAPYRUS_PUBLIC_DIR) : undefined,
    importDir: e.PAPYRUS_IMPORT_DIR ? path.resolve(e.PAPYRUS_IMPORT_DIR) : undefined,
    importPollSeconds: e.PAPYRUS_IMPORT_POLL_SECONDS,
    importDeleteSource: e.PAPYRUS_IMPORT_DELETE_SOURCE,
    maxUploadBytes: e.PAPYRUS_MAX_UPLOAD_MB * 1024 * 1024,
    trustProxy: e.PAPYRUS_TRUST_PROXY,
    logLevel: e.LOG_LEVEL,
  }
}
