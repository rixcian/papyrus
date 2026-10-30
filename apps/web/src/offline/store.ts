import { openDb, request, STORES } from '@/sync/db'
import { fileCacheKey, OFFLINE_CACHE } from './caches'

/** What the app needs to list and open an Offline Book with no connection. */
export interface OfflineBook {
  profileId: string
  bookId: string
  title: string
  authors: string[]
  coverUrl: string | null
  sharedBy: string | null
  files: { id: string; format: string; originalName: string; size: number }[]
  /** Bytes stored for it, Files and cover. */
  bytes: number
  savedAt: number
}

export type OfflineSource = Omit<OfflineBook, 'profileId' | 'bookId' | 'bytes' | 'savedAt'> & {
  id: string
}

interface CacheLike {
  match(key: string): Promise<Response | undefined>
  put(key: string, response: Response): Promise<void>
  delete(key: string): Promise<boolean>
}

export interface OfflineStoreOptions {
  factory?: IDBFactory
  cache?: () => Promise<CacheLike>
  fetch?: typeof fetch
  storage?: StorageManager | undefined
}

const keysOf = (book: Pick<OfflineBook, 'files' | 'coverUrl'>) => [
  ...book.files.map((f) => fileCacheKey(f.id)),
  ...(book.coverUrl ? [book.coverUrl] : []),
]

/**
 * Offline Books (ticket 05): Files and covers in the Cache API, and an IndexedDB index of
 * which Books each Profile keeps. Several Profiles can keep the same Book; its bytes go only
 * when the last one lets go.
 */
export class OfflineStore {
  private db: Promise<IDBDatabase> | undefined
  private readonly factory: IDBFactory
  private readonly cache: () => Promise<CacheLike>
  private readonly fetchImpl: typeof fetch
  private readonly storage: StorageManager | undefined

  constructor(options: OfflineStoreOptions = {}) {
    this.factory = options.factory ?? indexedDB
    this.cache = options.cache ?? (() => caches.open(OFFLINE_CACHE))
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args))
    this.storage = 'storage' in options ? options.storage : navigator.storage
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    this.db ??= openDb(this.factory)
    return (await this.db).transaction(STORES.offline, mode).objectStore(STORES.offline)
  }

  async list(profileId: string): Promise<OfflineBook[]> {
    const index = (await this.store('readonly')).index('byProfile')
    const books = (await request(index.getAll(profileId))) as OfflineBook[]
    return books.sort((a, b) => b.savedAt - a.savedAt)
  }

  async get(profileId: string, bookId: string): Promise<OfflineBook | undefined> {
    return (await request((await this.store('readonly')).get([profileId, bookId]))) as
      | OfflineBook
      | undefined
  }

  /** The Offline Book holding this File, for opening it with no connection. */
  async findFile(profileId: string, fileId: string): Promise<OfflineBook | undefined> {
    return (await this.list(profileId)).find((b) => b.files.some((f) => f.id === fileId))
  }

  /** The cached bytes of a File, if any Profile on this device keeps it offline. */
  async fileBlob(fileId: string): Promise<Blob | undefined> {
    const hit = await (await this.cache()).match(fileCacheKey(fileId))
    return hit ? hit.blob() : undefined
  }

  /**
   * Downloads the Book's Files and cover, then records it. Nothing is recorded unless every
   * File arrived, so a half-saved Book never looks available offline.
   */
  async save(profileId: string, book: OfflineSource): Promise<OfflineBook> {
    const first = (await this.list(profileId)).length === 0
    const cache = await this.cache()
    let bytes = 0
    for (const key of keysOf(book)) {
      const existing = await cache.match(key)
      if (existing) {
        bytes += (await existing.clone().blob()).size
        continue
      }
      const res = await this.fetchImpl(key, { credentials: 'same-origin' })
      if (!res.ok) {
        if (key === book.coverUrl) continue // A missing cover shouldn't stop reading offline.
        throw new Error(`Couldn’t download ${key} (${res.status})`)
      }
      bytes += Number(res.headers.get('content-length')) || 0
      await cache.put(key, res)
    }
    const { id, ...fields } = book
    const record: OfflineBook = { ...fields, profileId, bookId: id, bytes, savedAt: Date.now() }
    await request((await this.store('readwrite')).put(record))
    // Ask the browser not to clear the cache under storage pressure (ticket 05).
    if (first) await this.storage?.persist?.().catch(() => false)
    return record
  }

  async remove(profileId: string, bookIds: string[]): Promise<void> {
    if (!bookIds.length) return
    const doomed: OfflineBook[] = []
    for (const bookId of bookIds) {
      const book = await this.get(profileId, bookId)
      if (!book) continue
      doomed.push(book)
      await request((await this.store('readwrite')).delete([profileId, bookId]))
    }
    await this.collect(doomed)
  }

  async removeAll(profileId: string): Promise<void> {
    await this.remove(
      profileId,
      (await this.list(profileId)).map((b) => b.bookId),
    )
  }

  /** Drops cached bytes no remaining Offline Book of any Profile still uses. */
  private async collect(removed: OfflineBook[]): Promise<void> {
    const all = (await request((await this.store('readonly')).getAll())) as OfflineBook[]
    const used = new Set(all.flatMap(keysOf))
    const cache = await this.cache()
    for (const key of new Set(removed.flatMap(keysOf))) if (!used.has(key)) await cache.delete(key)
  }
}
