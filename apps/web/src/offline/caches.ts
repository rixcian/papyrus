/** The Cache API cache holding Offline Books' Files and covers (ticket 05). */
export const OFFLINE_CACHE = 'papyrus-offline-v1'

/** Cache key for a File: its URL without a query, so `?download=1` never hits it. */
export const fileCacheKey = (fileId: string) => `/api/files/${fileId}`
