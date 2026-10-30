import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnnotationStore } from './annotations'
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
  const factory = new IDBFactory()
  const outbox = new Outbox(factory)
  const annotations = new AnnotationStore(factory)
  const engine = new SyncEngine({
    storage,
    outbox,
    annotations,
    clock: new DeviceClock(storage),
    fetch: fetchMock as unknown as typeof fetch,
    debounceMs: 60_000,
  })
  return { engine, outbox, annotations, storage, sent }
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

  it('stores Highlights locally at once, and keeps the newer of local and pulled', async () => {
    const pulled: ServerRecord[] = []
    const { engine, annotations } = setup(() => ({ records: pulled }))
    const base = {
      id: 'h1',
      fileId: 'f1',
      cfiRange: 'epubcfi(/6/4!/4,/1:0,/1:4)',
      colour: 'yellow' as const,
      text: 'spice',
      note: null,
      deleted: false,
    }
    const local = await engine.record('alice', { kind: 'highlight', ...base })
    expect(await annotations.forFile('alice', 'f1')).toMatchObject([{ id: 'h1', colour: 'yellow' }])

    pulled.push({
      kind: 'highlight',
      bookId: 'b1',
      ...base,
      colour: 'pink',
      hlc: '0000000000001-0000-old',
    })
    await engine.flush('alice')
    expect(await annotations.forFile('alice', 'f1')).toMatchObject([
      { colour: 'yellow', hlc: local.hlc },
    ])

    pulled.splice(0, 1, {
      kind: 'highlight',
      bookId: 'b1',
      ...base,
      deleted: true,
      hlc: `${String(Date.now() + 60_000).padStart(13, '0')}-0000-laptop`,
    })
    await engine.flush('alice')
    expect(await annotations.forFile('alice', 'f1')).toMatchObject([{ deleted: true }])
  })

  it('never shows one Profile’s annotations to another', async () => {
    const { engine, annotations } = setup()
    await engine.record('alice', {
      kind: 'bookmark',
      id: 'b1',
      fileId: 'f1',
      cfi: 'epubcfi(/6/4!/4)',
      snippet: 's',
      deleted: false,
    })
    expect(await annotations.forFile('bob', 'f1')).toEqual([])
  })

  it('reports Offline Books and evicts what the server says to', async () => {
    const storage = new MemoryStorage()
    const factory = new IDBFactory()
    const offline = new Map([['alice', ['book-1', 'book-2']]])
    const sent: { offlineBookIds: string[] }[] = []
    const engine = new SyncEngine({
      storage,
      outbox: new Outbox(factory),
      annotations: new AnnotationStore(factory),
      clock: new DeviceClock(storage),
      debounceMs: 60_000,
      offline: {
        bookIds: async (profileId) => offline.get(profileId) ?? [],
        evict: async (profileId, ids) =>
          void offline.set(
            profileId,
            (offline.get(profileId) ?? []).filter((id) => !ids.includes(id)),
          ),
      },
      fetch: (async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(init.body as string))
        return new Response(
          JSON.stringify({ applied: 0, cursor: 1, records: [], evict: ['book-2'] }),
        )
      }) as unknown as typeof fetch,
    })
    await engine.flush('alice')
    expect(sent[0]?.offlineBookIds).toEqual(['book-1', 'book-2'])
    expect(offline.get('alice')).toEqual(['book-1'])
  })
})
