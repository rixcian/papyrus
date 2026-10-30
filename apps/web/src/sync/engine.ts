import { DeviceClock } from './clock'
import { writeLocalProgress } from './local-progress'
import { type Change, Outbox, type OutboxEntry, type ReadStatus } from './outbox'

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

type ChangeInput =
  | { kind: 'progress'; fileId: string; cfi: string; fraction: number }
  | { kind: 'readStatus'; bookId: string; status: ReadStatus }

export interface SyncEngineOptions {
  outbox?: Outbox
  clock?: DeviceClock
  storage?: Storage
  fetch?: typeof fetch
  /** Quiet period before a flush (ticket 08: about 2 s). */
  debounceMs?: number
}

const cursorKey = (profileId: string) => `papyrus:sync-cursor:${profileId}`

/**
 * Hand-rolled reading-state sync (ADR 0002): changes go to an IndexedDB outbox tagged with
 * their Profile, and every flush pushes them and pulls what changed since the last cursor.
 */
export class SyncEngine {
  readonly clock: DeviceClock
  private readonly outbox: Outbox
  private readonly storage: Storage
  private readonly fetchImpl: typeof fetch
  private readonly debounceMs: number
  private timer: ReturnType<typeof setTimeout> | undefined
  private flushing: Promise<void> | undefined
  private again = false
  private readonly listeners = new Set<(profileId: string, records: ServerRecord[]) => void>()

  constructor(options: SyncEngineOptions = {}) {
    this.storage = options.storage ?? localStorage
    this.clock = options.clock ?? new DeviceClock(this.storage)
    this.outbox = options.outbox ?? new Outbox()
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args))
    this.debounceMs = options.debounceMs ?? 2000
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
          }),
        })
      } catch {
        return // Offline: everything stays queued for the next trigger.
      }
      if (res.status === 410) {
        // The Profile was deleted; its queued changes can never land (ticket 08).
        await this.outbox.dropProfile(profileId)
        this.storage.removeItem(cursorKey(profileId))
        continue
      }
      if (!res.ok) continue
      const body = (await res.json()) as { cursor: number; records: ServerRecord[] }
      await this.outbox.acknowledge(sent)
      this.storage.setItem(cursorKey(profileId), String(body.cursor))
      this.applyPulled(profileId, body.records)
    }
  }

  private applyPulled(profileId: string, records: ServerRecord[]): void {
    for (const r of records) {
      this.clock.observe(r.hlc)
      if (r.kind === 'progress')
        writeLocalProgress(
          profileId,
          r.fileId,
          { cfi: r.cfi, fraction: r.fraction, hlc: r.hlc, deviceId: r.deviceId },
          this.storage,
        )
    }
    if (records.length) for (const listener of this.listeners) listener(profileId, records)
  }
}
