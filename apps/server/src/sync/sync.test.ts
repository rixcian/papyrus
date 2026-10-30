import { encodeHlc } from '@papyrus/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'

let h: Harness
afterEach(() => h?.close())

const at = (wall: number, node = 'phone') => encodeHlc({ wall, counter: 0, node })
const NOW = Date.now()

async function setup() {
  h = await createHarness()
  const device = new Device(h.app)
  const alice = await device.createProfile('Alice')
  const epub = await buildEpub({
    metadata: '<dc:title>Dune</dc:title><dc:creator>Frank Herbert</dc:creator>',
  })
  const { bookId } = (
    await device.request({ method: 'POST', url: '/api/uploads', ...multipart('dune.epub', epub) })
  ).json()
  const [file] = (await device.request({ url: `/api/books/${bookId}` })).json().files
  return { device, alice, bookId: bookId as string, fileId: file.id as string }
}

type SyncBody = { cursor?: number; changes?: unknown[]; profileId?: string; deviceId?: string }

async function sync(device: Device, profileId: string, body: SyncBody = {}) {
  const res = await device.request({
    method: 'POST',
    url: '/api/sync',
    payload: { profileId, deviceId: 'phone', cursor: 0, changes: [], ...body },
  })
  return { status: res.statusCode, body: res.json() }
}

const progress = (fileId: string, fraction: number, hlc: string) => ({
  kind: 'progress',
  fileId,
  cfi: `epubcfi(/6/${Math.round(fraction * 100)})`,
  fraction,
  hlc,
})
const status = (bookId: string, s: string, hlc: string) => ({
  kind: 'readStatus',
  bookId,
  status: s,
  hlc,
})

describe('POST /api/sync', () => {
  it('keeps the newest Reading Progress per File (last write wins on HLC)', async () => {
    const { device, alice, fileId } = await setup()
    await sync(device, alice.id, { changes: [progress(fileId, 0.4, at(NOW))] })
    const stale = await sync(device, alice.id, {
      changes: [progress(fileId, 0.9, at(NOW - 1000, 'laptop'))],
    })
    expect(stale.body.applied).toBe(0)
    await sync(device, alice.id, { changes: [progress(fileId, 0.2, at(NOW + 1000, 'laptop'))] })
    const state = (await device.request({ url: `/api/files/${fileId}/state` })).json()
    expect(state.progress).toMatchObject({ fraction: 0.2, hlc: at(NOW + 1000, 'laptop') })
  })

  it('pulls only what changed since the cursor', async () => {
    const { device, alice, fileId } = await setup()
    const first = await sync(device, alice.id, { changes: [progress(fileId, 0.4, at(NOW))] })
    expect(first.body.records.map((r: { kind: string }) => r.kind).sort()).toEqual([
      'progress',
      'readStatus',
    ])
    const again = await sync(device, alice.id, { cursor: first.body.cursor })
    expect(again.body.records).toEqual([])
    await sync(device, alice.id, { changes: [progress(fileId, 0.5, at(NOW + 1))] })
    const next = await sync(device, alice.id, { cursor: first.body.cursor })
    expect(next.body.records).toMatchObject([{ kind: 'progress', fraction: 0.5 }])
  })

  it('moves Read Status forward from progress, and a later manual status wins', async () => {
    const { device, alice, bookId, fileId } = await setup()
    const readStatus = async () =>
      (await device.request({ url: `/api/files/${fileId}/state` })).json().readStatus
    expect(await readStatus()).toBe('unread')
    await sync(device, alice.id, { changes: [progress(fileId, 0.1, at(NOW))] })
    expect(await readStatus()).toBe('reading')
    await sync(device, alice.id, { changes: [progress(fileId, 0.99, at(NOW + 10))] })
    expect(await readStatus()).toBe('finished')
    // Rereading from the start doesn't un-finish the Book.
    await sync(device, alice.id, { changes: [progress(fileId, 0.05, at(NOW + 20))] })
    expect(await readStatus()).toBe('finished')
    await sync(device, alice.id, { changes: [status(bookId, 'unread', at(NOW + 30))] })
    expect(await readStatus()).toBe('unread')
    // Progress older than the manual status doesn't override it.
    await sync(device, alice.id, { changes: [progress(fileId, 0.5, at(NOW + 25, 'laptop'))] })
    expect(await readStatus()).toBe('unread')
    await sync(device, alice.id, { changes: [progress(fileId, 0.5, at(NOW + 40))] })
    expect(await readStatus()).toBe('reading')
  })

  it('drops changes from a clock far in the future, and malformed timestamps', async () => {
    const { device, alice, fileId } = await setup()
    const res = await sync(device, alice.id, {
      changes: [
        progress(fileId, 0.4, at(NOW + 3 * 24 * 3600 * 1000)),
        progress(fileId, 0.4, 'yesterday'),
      ],
    })
    expect(res.body.applied).toBe(0)
  })

  it('drops changes for deleted Files and Books without failing', async () => {
    const { device, alice } = await setup()
    const res = await sync(device, alice.id, {
      changes: [progress('gone-file', 0.4, at(NOW)), status('gone-book', 'finished', at(NOW))],
    })
    expect(res).toMatchObject({ status: 200, body: { applied: 0 } })
  })

  it('takes the Profile from the body, not the device’s Active Profile', async () => {
    const { device, alice, fileId } = await setup()
    await device.createProfile('Bob')
    await sync(device, alice.id, { changes: [progress(fileId, 0.3, at(NOW))] })
    const row = h.db.$client.prepare('select profile_id from reading_progress').get() as {
      profile_id: string
    }
    expect(row.profile_id).toBe(alice.id)
  })

  it('answers 410 for a deleted Profile so the device drops its outbox', async () => {
    const { device } = await setup()
    expect((await sync(device, 'deleted-profile')).status).toBe(410)
  })
})

describe('reading state in the library', () => {
  it('reports Read Status and the File read most recently, and filters by status', async () => {
    const { device, alice, bookId, fileId } = await setup()
    await sync(device, alice.id, { changes: [progress(fileId, 0.42, at(NOW))] })
    const [book] = (await device.request({ url: '/api/books' })).json().books
    expect(book).toMatchObject({ readStatus: 'reading', lastRead: { fileId, fraction: 0.42 } })
    expect((await device.request({ url: '/api/books?status=finished' })).json().books).toEqual([])
    expect((await device.request({ url: `/api/books/${bookId}` })).json().readStatus).toBe(
      'reading',
    )
  })
})

describe('evicting Offline Books', () => {
  it('tells a device to drop Offline Books that are deleted, unshared or hidden', async () => {
    const { device, alice, bookId } = await setup()
    const bob = new Device(h.app)
    const bobProfile = await bob.createProfile('Bob')
    const evictFor = async (d: Device, profileId: string, ids: string[]) =>
      (await sync(d, profileId, { offlineBookIds: ids } as SyncBody)).body.evict

    expect(await evictFor(device, alice.id, [bookId, 'gone'])).toEqual(['gone'])
    expect(await evictFor(bob, bobProfile.id, [bookId])).toEqual([bookId])

    const share = (mode: string) =>
      device.request({ method: 'PUT', url: `/api/books/${bookId}/share`, payload: { mode } })
    await share('everyone')
    expect(await evictFor(bob, bobProfile.id, [bookId])).toEqual([])
    await bob.request({
      method: 'PUT',
      url: `/api/books/${bookId}/hidden`,
      payload: { hidden: true },
    })
    expect(await evictFor(bob, bobProfile.id, [bookId])).toEqual([bookId])
    await bob.request({
      method: 'PUT',
      url: `/api/books/${bookId}/hidden`,
      payload: { hidden: false },
    })
    await share('none')
    expect(await evictFor(bob, bobProfile.id, [bookId])).toEqual([bookId])
  })
})
