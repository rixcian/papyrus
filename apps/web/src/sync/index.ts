import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { SyncEngine } from './engine'

export type { ReadStatus } from './outbox'

/** One engine per browser tab. */
export const syncEngine = new SyncEngine()

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
    const unsubscribe = syncEngine.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: ['books'] }),
    )
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
