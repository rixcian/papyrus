import { AnnotationStore, type StoredAnnotation } from './annotations'
import { DeviceClock } from './clock'
import { writeLocalProgress } from './local-progress'
import {
  type BookmarkFields,
  type Change,
  type HighlightFields,
  Outbox,
  type OutboxEntry,
  type ReadStatus,
} from './outbox'

export type ServerRecord =
  | {
      kind: 'progress'
      fileId: string
      bookId: string
      cfi: string
      fraction: number
      deviceId: string
      hlc: string
    }
  | { kind: 'readStatus'; bookId: string; status: ReadStatus; hlc: string }
  | ({ kind: 'bookmark'; bookId: string; hlc: string } & BookmarkFields)
  | ({ kind: 'highlight'; bookId: string; hlc: string } & HighlightFields)

type ChangeInput =
  | { kind: 'progress'; fileId: string; cfi: string; fraction: number }
  | { kind: 'readStatus'; bookId: string; status: ReadStatus }
  | ({ kind: 'bookmark' } & BookmarkFields)
  | ({ kind: 'highlight' } & HighlightFields)

export interface SyncEngineOptions {
  outbox?: Outbox
  annotations?: AnnotationStore
  clock?: DeviceClock
  storage?: Storage
  fetch?: typeof fetch
  /** Quiet period before a flush (ticket 08: about 2 s). */
  debounceMs?: number
  /** This device's Offline Books, reported on every sync so the server can say what to evict. */
  offline?: OfflineIndex
}

export interface OfflineIndex {
  bookIds(profileId: string): Promise<string[]>
  evict(profileId: string, bookIds: string[]): Promise<void>
}

const cursorKey = (profileId: string) => `papyrus:sync-cursor:${profileId}`

/**
 * Hand-rolled reading-state sync (ADR 0002): changes go to an IndexedDB outbox tagged with
 * their Profile, and every flush pushes them and pulls what changed since the last cursor.
 */
export class SyncEngine {
  readonly clock: DeviceClock
  readonly annotations: AnnotationStore
  private readonly outbox: Outbox
  private readonly storage: Storage
  private readonly fetchImpl: typeof fetch
  private readonly debounceMs: number
  private readonly offline: OfflineIndex | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private flushing: Promise<void> | undefined
  private again = false
  private readonly listeners = new Set<(profileId: string, records: ServerRecord[]) => void>()

  constructor(options: SyncEngineOptions = {}) {
    this.storage = options.storage ?? localStorage
    this.clock = options.clock ?? new DeviceClock(this.storage)
    this.outbox = options.outbox ?? new Outbox()
    this.annotations = options.annotations ?? new AnnotationStore()
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args))
    this.debounceMs = options.debounceMs ?? 2000
    this.offline = options.offline
  }

  get deviceId(): string {
    return this.clock.node
  }

  /** Called with the records each sync pulled, so the UI can refresh. */
  subscribe(listener: (profileId: string, records: ServerRecord[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Stamps a change, queues it, and schedules a flush after a quiet period. */
  async record(profileId: string, input: ChangeInput): Promise<Change> {
    const change = { ...input, hlc: this.clock.tick() } as Change
    if (change.kind === 'progress')
      writeLocalProgress(
        profileId,
        change.fileId,
        { cfi: change.cfi, fraction: change.fraction, hlc: change.hlc, deviceId: this.deviceId },
        this.storage,
      )
    if (change.kind === 'bookmark' || change.kind === 'highlight') {
      await this.annotations.put({ ...change, profileId } as StoredAnnotation)
      this.notify(profileId, [])
    }
    await this.outbox.put(profileId, change)
    this.schedule()
    return change
  }

  schedule(delay = this.debounceMs): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), delay)
  }

  /**
   * Pushes the outbox and pulls for every Profile with queued changes, plus `alsoPull`
   * (normally the Active Profile). Concurrent calls share one run.
   */
  flush(alsoPull?: string, options: { keepalive?: boolean } = {}): Promise<void> {
    clearTimeout(this.timer)
    if (this.flushing) {
      this.again = true
      return this.flushing
    }
    this.flushing = this.run(alsoPull, options).finally(() => {
      this.flushing = undefined
      if (this.again) {
        this.again = false
        void this.flush(alsoPull)
      }
    })
    return this.flushing
  }

  private async run(
    alsoPull: string | undefined,
    { keepalive }: { keepalive?: boolean },
  ): Promise<void> {
    const entries = await this.outbox.all()
    const byProfile = new Map<string, OutboxEntry[]>()
    for (const e of entries) byProfile.set(e.profileId, [...(byProfile.get(e.profileId) ?? []), e])
    if (alsoPull && !byProfile.has(alsoPull)) byProfile.set(alsoPull, [])

    for (const [profileId, sent] of byProfile) {
      const offlineBookIds = (await this.offline?.bookIds(profileId)) ?? []
      let res: Response
      try {
        res = await this.fetchImpl('/api/sync', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          keepalive: Boolean(keepalive),
          body: JSON.stringify({
            profileId,
            deviceId: this.deviceId,
            cursor: Number(this.storage.getItem(cursorKey(profileId)) ?? 0),
            changes: sent.map((e) => e.change),
            offlineBookIds,
          }),
        })
      } catch {
        return // Offline: everything stays queued for the next trigger.
      }
      if (res.status === 410) {
        // The Profile was deleted; its queued changes can never land (ticket 08).
        await this.outbox.dropProfile(profileId)
        this.storage.removeItem(cursorKey(profileId))
        await this.evict(profileId, offlineBookIds)
        continue
      }
      if (!res.ok) continue
      const body = (await res.json()) as {
        cursor: number
        records: ServerRecord[]
        evict?: string[]
      }
      await this.outbox.acknowledge(sent)
      this.storage.setItem(cursorKey(profileId), String(body.cursor))
      await this.applyPulled(profileId, body.records)
      await this.evict(profileId, body.evict ?? [])
    }
  }

  /** Deleted, unshared or hidden Books leave the device (ticket 06). */
  private async evict(profileId: string, bookIds: string[]): Promise<void> {
    if (!bookIds.length || !this.offline) return
    await this.offline.evict(profileId, bookIds)
    this.notify(profileId, [])
  }

  private async applyPulled(profileId: string, records: ServerRecord[]): Promise<void> {
    for (const r of records) {
      this.clock.observe(r.hlc)
      if (r.kind === 'progress')
        writeLocalProgress(
          profileId,
          r.fileId,
          { cfi: r.cfi, fraction: r.fraction, hlc: r.hlc, deviceId: r.deviceId },
          this.storage,
        )
      if (r.kind === 'bookmark' || r.kind === 'highlight') {
        const { bookId: _bookId, ...fields } = r
        await this.annotations.put({ ...fields, profileId } as StoredAnnotation)
      }
    }
    if (records.length) this.notify(profileId, records)
  }

  /** Pulled records, or none for a local change; either way views re-read their data. */
  private notify(profileId: string, records: ServerRecord[]): void {
    for (const listener of this.listeners) listener(profileId, records)
  }
}
