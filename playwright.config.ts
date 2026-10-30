import os from 'node:os'
import path from 'node:path'
import { defineConfig } from '@playwright/test'

// Runs against the production bundle: build first (`pnpm build`), then `pnpm e2e`.
const dataDir = path.join(os.tmpdir(), `papyrus-e2e-${process.pid}`)

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:18090', trace: 'retain-on-failure' },
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: 'http://localhost:18090/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '18090',
      PAPYRUS_DATA_DIR: dataDir,
      PAPYRUS_PUBLIC_DIR: 'apps/web/dist',
      LOG_LEVEL: 'warn',
    },
  },
})
