import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api, unwrap } from '@/api/client'
import type { OfflineSource } from '@/offline/store'
import { offlineStore } from '@/sync'
import type { BookDetail } from './books'

/**
 * Offline Books need the Cache API and a service worker, which browsers only give secure
 * contexts: HTTPS, or localhost (ticket 05).
 */
export const offlineSupported =
  typeof window !== 'undefined' && window.isSecureContext && 'caches' in window

/** The server can't be reached: no network, or a proxy in front of it says it's down. */
export function isUnreachable(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof ApiError && error.status >= 502 && error.status <= 504)
  )
}

/**
 * Calls the server, remembers the answer in localStorage, and falls back to the remembered
 * answer when the server can't be reached, so the app still opens offline (ticket 05).
 */
export async function remembered<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load()
    localStorage.setItem(key, JSON.stringify(value))
    return value
  } catch (error) {
    const saved = localStorage.getItem(key)
    if (saved !== null && isUnreachable(error)) return JSON.parse(saved) as T
    throw error
  }
}

export const offlineKeys = {
  all: ['offline'] as const,
  list: (profileId: string) => ['offline', profileId] as const,
  storage: ['offline', 'storage'] as const,
}

export function useOfflineBooks(profileId: string | undefined) {
  return useQuery({
    queryKey: offlineKeys.list(profileId ?? ''),
    enabled: Boolean(profileId),
    queryFn: () => offlineStore.list(profileId ?? ''),
    staleTime: 0,
  })
}

/** Readable Files only: the others can be downloaded but never opened in the reader. */
export function offlineSource(book: BookDetail): OfflineSource {
  return {
    id: book.id,
    title: book.title,
    authors: book.authors,
    coverUrl: book.coverUrl,
    sharedBy: book.sharedBy,
    files: book.files
      .filter((f) => f.readable)
      .map(({ id, format, originalName, size }) => ({ id, format, originalName, size })),
  }
}

function useOfflineMutation<A>(fn: (args: A) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: offlineKeys.all }),
  })
}

/** Makes Books available offline; takes ids so multi-select works without Book detail. */
export function useSaveOffline(profileId: string) {
  return useOfflineMutation(async (bookIds: string[]) => {
    for (const bookId of bookIds) {
      const book = await unwrap(api.GET('/api/books/{bookId}', { params: { path: { bookId } } }))
      const source = offlineSource(book)
      if (source.files.length) await offlineStore.save(profileId, source)
    }
  })
}

export function useRemoveOffline(profileId: string) {
  return useOfflineMutation((bookIds: string[] | 'all') =>
    bookIds === 'all' ? offlineStore.removeAll(profileId) : offlineStore.remove(profileId, bookIds),
  )
}

/** How much this site stores, and whether the browser promised to keep it. */
export function useStorageInfo() {
  return useQuery({
    queryKey: offlineKeys.storage,
    staleTime: 0,
    queryFn: async () => {
      const storage = navigator.storage as StorageManager | undefined
      const [estimate, persisted] = await Promise.all([
        storage?.estimate?.() ?? Promise.resolve(undefined),
        storage?.persisted?.() ?? Promise.resolve(false),
      ])
      return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted }
    },
  })
}
