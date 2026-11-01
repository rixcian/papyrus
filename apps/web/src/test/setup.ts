import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { resetApi, route } from './api'

// Offline Books need a secure context; tests run as if on localhost.
Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

/** happy-dom has no MediaError; the Player reads its codes. */
vi.stubGlobal('MediaError', {
  MEDIA_ERR_ABORTED: 1,
  MEDIA_ERR_NETWORK: 2,
  MEDIA_ERR_DECODE: 3,
  MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
})

/** The Cache API, which happy-dom lacks: one Map of blobs per cache name. */
export const cacheEntries = new Map<string, Map<string, Blob>>()
vi.stubGlobal('caches', {
  open: async (name: string) => {
    const entries = cacheEntries.get(name) ?? new Map<string, Blob>()
    cacheEntries.set(name, entries)
    return {
      match: async (key: string) => (entries.has(key) ? new Response(entries.get(key)) : undefined),
      put: async (key: string, res: Response) => void entries.set(key, await res.blob()),
      delete: async (key: string) => entries.delete(key),
    }
  },
})

beforeEach(() => {
  resetApi()
  // The sync engine flushes from many screens; by default the server has nothing new.
  route('POST /api/sync', { cursor: 0, records: [] })
  cacheEntries.clear()
  localStorage.clear()
})

afterEach(() => cleanup())
