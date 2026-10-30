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
  PAPYRUS_DEEPL_API_KEY: z.string().optional(),
  PAPYRUS_DEEPL_URL: z.url().optional(),
  PAPYRUS_OPENLIBRARY_URL: z.url().default('https://openlibrary.org'),
  PAPYRUS_OPENLIBRARY_COVERS_URL: z.url().default('https://covers.openlibrary.org'),
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
  /** Turns on translating selections in the reader. */
  deeplApiKey: string | undefined
  /** Overrides the DeepL host, which otherwise follows the key's plan; tests use a fake. */
  deeplUrl: string | undefined
  /** Where "Find online" asks; tests point these at a fake. */
  openLibraryUrl: string
  openLibraryCoversUrl: string
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
    deeplApiKey: e.PAPYRUS_DEEPL_API_KEY?.trim() || undefined,
    deeplUrl: e.PAPYRUS_DEEPL_URL,
    openLibraryUrl: e.PAPYRUS_OPENLIBRARY_URL.replace(/\/$/, ''),
    openLibraryCoversUrl: e.PAPYRUS_OPENLIBRARY_COVERS_URL.replace(/\/$/, ''),
    logLevel: e.LOG_LEVEL,
  }
}
