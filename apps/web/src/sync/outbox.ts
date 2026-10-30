import type { HighlightColour } from '@papyrus/shared'
import { openDb, request, STORES } from './db'

export type ReadStatus = 'unread' | 'reading' | 'finished'

export interface BookmarkFields {
  id: string
  fileId: string
  cfi: string
  snippet: string
  deleted: boolean
}

export interface HighlightFields {
  id: string
  fileId: string
  cfiRange: string
  colour: HighlightColour
  text: string
  note: string | null
  deleted: boolean
}

export type Change =
  | { kind: 'progress'; fileId: string; cfi: string; fraction: number; hlc: string }
  | { kind: 'readStatus'; bookId: string; status: ReadStatus; hlc: string }
  | ({ kind: 'bookmark'; hlc: string } & BookmarkFields)
  | ({ kind: 'highlight'; hlc: string } & HighlightFields)

export interface OutboxEntry {
  /** One entry per record: writing the same record again replaces it (ticket 08). */
  key: string
  profileId: string
  change: Change
}

export function entryKey(profileId: string, change: Change): string {
  switch (change.kind) {
    case 'progress':
      return `${profileId}|progress|${change.fileId}`
    case 'readStatus':
      return `${profileId}|readStatus|${change.bookId}`
    default:
      return `${profileId}|${change.kind}|${change.id}`
  }
}

const STORE = STORES.outbox

/** Changes waiting to reach the server, tagged with the Profile that made them. */
export class Outbox {
  private db: Promise<IDBDatabase> | undefined
  private readonly factory: IDBFactory

  constructor(factory: IDBFactory = indexedDB) {
    this.factory = factory
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= openDb(this.factory)
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
