import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceClock } from './clock'
import { type ServerRecord, SyncEngine } from './engine'
import { readLocalProgress } from './local-progress'
import { Outbox } from './outbox'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

type Sent = { profileId: string; cursor: number; changes: { kind: string; fraction?: number }[] }

function setup(
  respond: (body: Sent) => {
    status?: number
    cursor?: number
    records?: ServerRecord[]
  } = () => ({}),
) {
  const storage = new MemoryStorage()
  const sent: Sent[] = []
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Sent
    sent.push(body)
    const { status = 200, cursor = 7, records = [] } = respond(body)
    return new Response(JSON.stringify({ applied: body.changes.length, cursor, records }), {
      status,
    })
  })
  const outbox = new Outbox(new IDBFactory())
  const engine = new SyncEngine({
    storage,
    outbox,
    clock: new DeviceClock(storage),
    fetch: fetchMock as unknown as typeof fetch,
    debounceMs: 60_000,
  })
  return { engine, outbox, storage, sent }
}

describe('SyncEngine', () => {
  beforeEach(() => vi.useRealTimers())

  it('coalesces Reading Progress to the latest entry per File', async () => {
    const { engine, sent } = setup()
    await engine.record('alice', { kind: 'progress', fileId: 'f1', cfi: 'a', fraction: 0.1 })
    await engine.record('alice', { kind: 'progress', fileId: 'f1', cfi: 'b', fraction: 0.2 })
    await engine.record('alice', { kind: 'progress', fileId: 'f2', cfi: 'c', fraction: 0.3 })
    await engine.flush()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.changes.map((c) => c.fraction).sort()).toEqual([0.2, 0.3])
  })

  it('sends each Profile’s changes separately, tagged with that Profile', async () => {
    const { engine, sent } = setup()
    await engine.record('alice', { kind: 'readStatus', bookId: 'b1', status: 'finished' })
    await engine.record('bob', { kind: 'readStatus', bookId: 'b2', status: 'reading' })
    await engine.flush()
    expect(sent.map((s) => s.profileId).sort()).toEqual(['alice', 'bob'])
  })

  it('empties the outbox after a successful sync and stores the cursor', async () => {
    const { engine, outbox, storage, sent } = setup()
    await engine.record('alice', { kind: 'readStatus', bookId: 'b1', status: 'finished' })
    await engine.flush()
    expect(await outbox.all()).toEqual([])
    await engine.flush('alice')
    expect(sent[1]).toMatchObject({ cursor: 7, changes: [] })
    expect(storage.getItem('papyrus:sync-cursor:alice')).toBe('7')
  })

  it('keeps everything queued when offline', async () => {
    const { engine, outbox } = setup()
    const offline = new SyncEngine({
      storage: new MemoryStorage(),
      outbox,
      fetch: (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch,
      debounceMs: 60_000,
    })
    await offline.record('alice', { kind: 'readStatus', bookId: 'b1', status: 'finished' })
    await offline.flush()
    expect(await outbox.all()).toHaveLength(1)
    void engine
  })

  it('drops a deleted Profile’s queue on 410', async () => {
    const { engine, outbox } = setup(() => ({ status: 410 }))
    await engine.record('ghost', { kind: 'readStatus', bookId: 'b1', status: 'finished' })
    await engine.flush()
    expect(await outbox.all()).toEqual([])
  })

  it('applies pulled progress only when it is newer than the local copy', async () => {
    const remote = (fraction: number, wall: number): ServerRecord => ({
      kind: 'progress',
      fileId: 'f1',
      bookId: 'b1',
      cfi: `cfi-${fraction}`,
      fraction,
      deviceId: 'laptop',
      hlc: `${String(wall).padStart(13, '0')}-0000-laptop`,
    })
    let reply: ServerRecord[] = [remote(0.9, 1)]
    const { engine, storage } = setup(() => ({ records: reply }))
    await engine.record('alice', { kind: 'progress', fileId: 'f1', cfi: 'local', fraction: 0.5 })
    await engine.flush()
    expect(readLocalProgress('alice', 'f1', storage)?.fraction).toBe(0.5)

    reply = [remote(0.7, Date.now() + 60_000)]
    const seen = vi.fn()
    engine.subscribe(seen)
    await engine.flush('alice')
    expect(readLocalProgress('alice', 'f1', storage)).toMatchObject({
      fraction: 0.7,
      deviceId: 'laptop',
    })
    expect(seen).toHaveBeenCalledWith('alice', reply)
    // The clock folded in the remote timestamp, so the next local change sorts after it.
    const next = await engine.record('alice', {
      kind: 'progress',
      fileId: 'f1',
      cfi: 'x',
      fraction: 0.71,
    })
    expect(next.hlc > (reply[0] as ServerRecord).hlc).toBe(true)
  })
})
