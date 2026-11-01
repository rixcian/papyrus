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
        'apps/web/src/test/**',
        // The coss UI kit, copied in by its CLI: its own project tests it.
        'apps/web/src/components/ui/**',
        'apps/web/src/hooks/**',
        'apps/web/src/lib/composer-*.ts',
      ],
      reporter: ['text-summary', 'json-summary', 'html'],
      // Fails `pnpm test:coverage` if line coverage drops below this.
      thresholds: { lines: 90 },
    },
  },
})
