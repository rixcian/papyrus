export type ReadStatus = 'unread' | 'reading' | 'finished'

export type Change =
  | { kind: 'progress'; fileId: string; cfi: string; fraction: number; hlc: string }
  | { kind: 'readStatus'; bookId: string; status: ReadStatus; hlc: string }

export interface OutboxEntry {
  /** One entry per record: writing the same record again replaces it (ticket 08). */
  key: string
  profileId: string
  change: Change
}

export function entryKey(profileId: string, change: Change): string {
  return change.kind === 'progress'
    ? `${profileId}|progress|${change.fileId}`
    : `${profileId}|readStatus|${change.bookId}`
}

const DB_NAME = 'papyrus'
const STORE = 'outbox'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Changes waiting to reach the server, tagged with the Profile that made them. */
export class Outbox {
  private db: Promise<IDBDatabase> | undefined
  private readonly factory: IDBFactory

  constructor(factory: IDBFactory = indexedDB) {
    this.factory = factory
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return this.db
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE)
  }

  async put(profileId: string, change: Change): Promise<void> {
    await request(
      (await this.store('readwrite')).put({ key: entryKey(profileId, change), profileId, change }),
    )
  }

  async all(): Promise<OutboxEntry[]> {
    return request((await this.store('readonly')).getAll() as IDBRequest<OutboxEntry[]>)
  }

  /** Removes sent entries, unless a newer change replaced one while the request was in flight. */
  async acknowledge(sent: OutboxEntry[]): Promise<void> {
    const store = await this.store('readwrite')
    await Promise.all(
      sent.map(async (entry) => {
        const current = (await request(store.get(entry.key))) as OutboxEntry | undefined
        if (current && current.change.hlc === entry.change.hlc)
          await request(store.delete(entry.key))
      }),
    )
  }

  async dropProfile(profileId: string): Promise<void> {
    const entries = (await this.all()).filter((e) => e.profileId === profileId)
    const store = await this.store('readwrite')
    await Promise.all(entries.map((e) => request(store.delete(e.key))))
  }
}
