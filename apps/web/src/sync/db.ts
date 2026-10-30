/**
 * The device's IndexedDB: the outbox (changes waiting to reach the server), the
 * annotations this device knows about, so Highlights show offline, and the Offline index.
 */
const DB_NAME = 'papyrus'
const VERSION = 3

export const STORES = { outbox: 'outbox', annotations: 'annotations', offline: 'offline' } as const

export function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      if (event.oldVersion < 1) db.createObjectStore(STORES.outbox, { keyPath: 'key' })
      if (event.oldVersion < 2) {
        const annotations = db.createObjectStore(STORES.annotations, { keyPath: 'id' })
        annotations.createIndex('byFile', ['profileId', 'fileId'])
      }
      if (event.oldVersion < 3) {
        // The Offline index: which Books each Profile keeps on this device (ticket 05).
        const offline = db.createObjectStore(STORES.offline, { keyPath: ['profileId', 'bookId'] })
        offline.createIndex('byProfile', 'profileId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
