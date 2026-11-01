import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['apps/server', 'apps/web', 'packages/shared'],
    // `pnpm test:coverage`; CI publishes the line coverage as the README badge.
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'apps/server/src/test/**',
        'apps/server/src/scripts/**',
        'apps/web/src/vendor/**',
      ],
      reporter: ['text-summary', 'json-summary', 'html'],
    },
  },
})
