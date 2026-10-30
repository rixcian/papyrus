import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { OfflineStore } from '@/offline/store'
import { SyncEngine } from './engine'

export type { ReadStatus } from './outbox'

/** This device's Offline Books (ticket 05). */
export const offlineStore = new OfflineStore()

/** One engine per browser tab. */
export const syncEngine = new SyncEngine({
  offline: {
    bookIds: async (profileId) => (await offlineStore.list(profileId)).map((b) => b.bookId),
    evict: (profileId, bookIds) => offlineStore.remove(profileId, bookIds),
  },
})

/**
 * Flushes on start, on reconnect, and when the tab is hidden or shown again (ticket 05:
 * Background Sync is Chromium-only, so these triggers are the fallback everywhere).
 */
export function useSync(profileId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!profileId) return
    const flush = () => void syncEngine.flush(profileId)
    const onVisibility = () =>
      document.visibilityState === 'hidden'
        ? void syncEngine.flush(profileId, { keepalive: true })
        : flush()
    const unsubscribe = syncEngine.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ['books'] })
      void queryClient.invalidateQueries({ queryKey: ['offline'] })
    })
    flush()
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      unsubscribe()
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [profileId, queryClient])
}
