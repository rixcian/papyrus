import { compareHlc } from '@papyrus/shared'
import { openDb, request, STORES } from './db'
import type { BookmarkFields, HighlightFields } from './outbox'

export type StoredAnnotation =
  | ({ kind: 'bookmark'; profileId: string; hlc: string } & BookmarkFields)
  | ({ kind: 'highlight'; profileId: string; hlc: string } & HighlightFields)

export type Bookmark = Extract<StoredAnnotation, { kind: 'bookmark' }>
export type Highlight = Extract<StoredAnnotation, { kind: 'highlight' }>

/** This device's Bookmarks and Highlights, including tombstones, per (Profile, File). */
export class AnnotationStore {
  private db: Promise<IDBDatabase> | undefined
  private readonly factory: IDBFactory

  constructor(factory: IDBFactory = indexedDB) {
    this.factory = factory
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    this.db ??= openDb(this.factory)
    return (await this.db).transaction(STORES.annotations, mode).objectStore(STORES.annotations)
  }

  /** Keeps whichever is newer, the stored record or this one; returns whether it was stored. */
  async put(record: StoredAnnotation): Promise<boolean> {
    const store = await this.store('readwrite')
    const current = (await request(store.get(record.id))) as StoredAnnotation | undefined
    if (
      current &&
      (current.profileId !== record.profileId || compareHlc(current.hlc, record.hlc) >= 0)
    )
      return false
    await request(store.put(record))
    return true
  }

  async forFile(profileId: string, fileId: string): Promise<StoredAnnotation[]> {
    const index = (await this.store('readonly')).index('byFile')
    return request(index.getAll([profileId, fileId]) as IDBRequest<StoredAnnotation[]>)
  }
}
