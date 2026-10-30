/**
 * The device's IndexedDB: the outbox (changes waiting to reach the server) and the
 * annotations this device knows about, so Highlights show offline.
 */
const DB_NAME = 'papyrus'
const VERSION = 2

export const STORES = { outbox: 'outbox', annotations: 'annotations' } as const

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
