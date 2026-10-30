import { encodeHlc } from '@papyrus/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart, PNG } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'

let h: Harness
afterEach(() => h?.close())

async function upload(device: Device, name: string, metadata: string, cover = false) {
  const epub = await buildEpub({
    metadata,
    ...(cover && {
      manifest: '<item id="img" href="cover.png" media-type="image/png" properties="cover-image"/>',
      files: { 'OEBPS/cover.png': PNG },
    }),
  })
  const res = await device.request({
    method: 'POST',
    url: '/api/uploads',
    ...multipart(name, epub),
  })
  return res.json().bookId as string
}

const at = (wall: number) => encodeHlc({ wall, counter: 0, node: 'phone' })

async function setup() {
  h = await createHarness()
  const alice = new Device(h.app)
  const aliceId = (await alice.createProfile('Alice')).id
  const target = await upload(
    alice,
    'dune.epub',
    '<dc:title>Dune</dc:title><dc:creator>Frank Herbert</dc:creator>',
  )
  const source = await upload(
    alice,
    'dune-copy.epub',
    '<dc:title>Dune copy</dc:title><dc:creator>Someone Else</dc:creator><dc:publisher>Ace</dc:publisher>',
    true,
  )
  const get = async (device: Device, bookId: string) =>
    device.request({ url: `/api/books/${bookId}` })
  const sourceFile = (await (await get(alice, source)).json()).files[0].id as string
  return { alice, aliceId, target, source, sourceFile, get }
}

const sync = (device: Device, profileId: string, changes: unknown[]) =>
  device.request({
    method: 'POST',
    url: '/api/sync',
    payload: { profileId, deviceId: 'phone', cursor: 0, changes },
  })

describe('merging Books', () => {
  it('moves Files with their reading state, keeps the target’s metadata, and deletes the source', async () => {
    const { alice, aliceId, target, source, sourceFile, get } = await setup()
    const now = Date.now()
    await sync(alice, aliceId, [
      {
        kind: 'progress',
        fileId: sourceFile,
        cfi: 'epubcfi(/6/4)',
        fraction: 0.4,
        hlc: at(now - 10),
      },
      {
        kind: 'highlight',
        id: 'highlight-1',
        fileId: sourceFile,
        cfiRange: 'epubcfi(/6/4!/4,/1:0,/1:5)',
        colour: 'yellow',
        text: 'words',
        note: null,
        deleted: false,
        hlc: at(now - 5),
      },
    ])
    const shelf = (
      await alice.request({ method: 'POST', url: '/api/shelves', payload: { name: 'Desert' } })
    ).json()
    await alice.request({
      method: 'POST',
      url: `/api/shelves/${shelf.id}/books`,
      payload: { add: [source] },
    })

    const res = await alice.request({
      method: 'POST',
      url: `/api/books/${source}/merge`,
      payload: { targetId: target },
    })
    expect(res.statusCode).toBe(200)
    const merged = res.json()
    expect(merged).toMatchObject({
      id: target,
      title: 'Dune',
      authors: ['Frank Herbert'],
      publisher: 'Ace',
      readStatus: 'reading',
      shelves: [{ id: shelf.id, name: 'Desert' }],
    })
    expect(merged.files).toHaveLength(2)
    expect(merged.coverUrl).not.toBeNull()
    expect((await alice.request({ url: merged.coverUrl })).statusCode).toBe(200)
    expect((await get(alice, source)).statusCode).toBe(404)
    expect((await alice.request({ url: '/api/books?q=copy' })).json().total).toBe(0)

    const state = (await alice.request({ url: `/api/files/${sourceFile}/state` })).json()
    expect(state.progress).toMatchObject({ fraction: 0.4 })
    const md = (await alice.request({ url: `/api/books/${target}/highlights.md` })).body
    expect(md).toContain('words')
  })

  it("merges a Recipient's Read Status, newest first", async () => {
    const { alice, target, source } = await setup()
    for (const id of [target, source])
      await alice.request({
        method: 'PUT',
        url: `/api/books/${id}/share`,
        payload: { mode: 'everyone' },
      })
    const bob = new Device(h.app)
    const bobId = (await bob.createProfile('Bob')).id
    const now = Date.now()
    await sync(bob, bobId, [
      { kind: 'readStatus', bookId: target, status: 'reading', hlc: at(now - 100) },
      { kind: 'readStatus', bookId: source, status: 'finished', hlc: at(now - 10) },
    ])
    await alice.request({
      method: 'POST',
      url: `/api/books/${source}/merge`,
      payload: { targetId: target },
    })
    expect((await bob.request({ url: `/api/books/${target}` })).json().readStatus).toBe('finished')
  })

  it('only merges two different Books of your own', async () => {
    const { alice, target, source } = await setup()
    const merge = (device: Device, from: string, to: string) =>
      device.request({ method: 'POST', url: `/api/books/${from}/merge`, payload: { targetId: to } })
    expect((await merge(alice, source, source)).statusCode).toBe(400)
    const bob = new Device(h.app)
    await bob.createProfile('Bob')
    const bobs = await upload(bob, 'b.epub', '<dc:title>Bob’s</dc:title>')
    expect((await merge(alice, source, bobs)).statusCode).toBe(404)
    await alice.request({
      method: 'PUT',
      url: `/api/books/${target}/share`,
      payload: { mode: 'everyone' },
    })
    expect((await merge(bob, bobs, target)).statusCode).toBe(403)
  })
})

describe('splitting a File into a new Book', () => {
  it('gives the File a Book with its own metadata, keeping Shares, shelves and Read Status', async () => {
    const { alice, aliceId, target, source, sourceFile, get } = await setup()
    await alice.request({
      method: 'POST',
      url: `/api/books/${source}/merge`,
      payload: { targetId: target },
    })
    const bob = new Device(h.app)
    const bobId = (await bob.createProfile('Bob')).id
    await alice.request({
      method: 'PUT',
      url: `/api/books/${target}/share`,
      payload: { mode: 'named', profileIds: [bobId] },
    })
    const shelf = (
      await alice.request({ method: 'POST', url: '/api/shelves', payload: { name: 'Desert' } })
    ).json()
    await alice.request({
      method: 'POST',
      url: `/api/shelves/${shelf.id}/books`,
      payload: { add: [target] },
    })
    await sync(alice, aliceId, [
      { kind: 'readStatus', bookId: target, status: 'finished', hlc: at(Date.now()) },
    ])

    const res = await alice.request({ method: 'POST', url: `/api/files/${sourceFile}/split` })
    expect(res.statusCode).toBe(200)
    const split = res.json()
    expect(split).toMatchObject({
      title: 'Dune copy',
      authors: ['Someone Else'],
      readStatus: 'finished',
      shelves: [{ id: shelf.id }],
      share: { mode: 'named', profiles: [{ id: bobId }] },
    })
    expect(split.files.map((f: { id: string }) => f.id)).toEqual([sourceFile])
    expect(split.coverUrl).not.toBeNull()
    expect((await get(alice, target)).json().files).toHaveLength(1)
    expect((await bob.request({ url: `/api/books/${split.id}` })).statusCode).toBe(200)

    // The last File stays: there would be nothing left of the Book.
    const last = (await get(alice, target)).json().files[0].id
    expect(
      (await alice.request({ method: 'POST', url: `/api/files/${last}/split` })).statusCode,
    ).toBe(409)
  })
})
