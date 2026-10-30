import os from 'node:os'
import path from 'node:path'
import { defineConfig } from '@playwright/test'

// Runs against the production bundle: build first (`pnpm build`), then `pnpm e2e`.
// Workers load this file again, so the directory is fixed once and inherited through env.
process.env.PAPYRUS_E2E_DATA_DIR ??= path.join(os.tmpdir(), `papyrus-e2e-${process.pid}`)
const dataDir = process.env.PAPYRUS_E2E_DATA_DIR
const importDir = path.join(dataDir, 'import')
// Tests drop files into the import folder through this.
process.env.PAPYRUS_E2E_IMPORT_DIR = importDir

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:18090', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node e2e/fake-services.ts 18091',
      url: 'http://localhost:18091/health',
      reuseExistingServer: false,
    },
    {
      command: 'node apps/server/dist/index.js',
      url: 'http://localhost:18090/api/health',
      reuseExistingServer: false,
      env: {
        PORT: '18090',
        PAPYRUS_DATA_DIR: dataDir,
        PAPYRUS_PUBLIC_DIR: 'apps/web/dist',
        PAPYRUS_IMPORT_DIR: importDir,
        PAPYRUS_IMPORT_POLL_SECONDS: '1',
        PAPYRUS_OPENLIBRARY_URL: 'http://localhost:18091',
        PAPYRUS_OPENLIBRARY_COVERS_URL: 'http://localhost:18091',
        PAPYRUS_DEEPL_API_KEY: 'e2e-key:fx',
        PAPYRUS_DEEPL_URL: 'http://localhost:18091',
        LOG_LEVEL: 'warn',
      },
    },
  ],
})
