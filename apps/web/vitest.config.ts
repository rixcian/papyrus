import path from 'node:path'
import { defineProject } from 'vitest/config'

export default defineProject({
  define: { __APP_VERSION__: JSON.stringify('0.0.0-test') },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'virtual:pwa-register/react': path.resolve(import.meta.dirname, 'src/test/pwa-register.ts'),
    },
  },
  test: {
    name: 'web',
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'http://localhost/' } },
    setupFiles: ['src/test/setup.ts'],
  },
})
