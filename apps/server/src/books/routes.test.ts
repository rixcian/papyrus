import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart, PNG } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'

let h: Harness
afterEach(() => h?.close())

const dune = () =>
  buildEpub({
    metadata:
      '<dc:title>Dune</dc:title><dc:creator>Frank Herbert</dc:creator><dc:identifier>urn:isbn:9780441172719</dc:identifier>',
    manifest: '<item id="img" href="cover.png" media-type="image/png" properties="cover-image"/>',
    files: { 'OEBPS/cover.png': PNG },
  })

async function upload(device: Device, filename: string, data: Buffer) {
  const res = await device.request({
    method: 'POST',
    url: '/api/uploads',
    ...multipart(filename, data),
  })
  return { status: res.statusCode, body: res.json() }
}

function blobCount(dataDir: string): number {
  const dir = path.join(dataDir, 'blobs')
  return fs.readdirSync(dir).flatMap((d) => fs.readdirSync(path.join(dir, d))).length
}

describe('uploading', () => {
  it('creates a Book with metadata and a cover', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const res = await upload(device, 'dune.epub', await dune())
    expect(res.body).toMatchObject({ status: 'created', title: 'Dune' })

    const { books } = (await device.request({ url: '/api/books' })).json()
    expect(books).toHaveLength(1)
    expect(books[0]).toMatchObject({
      title: 'Dune',
      authors: ['Frank Herbert'],
      formats: ['epub'],
      owned: true,
    })

    const cover = await device.request({ url: books[0].coverUrl })
    expect(cover.statusCode).toBe(200)
    expect(cover.rawPayload.equals(PNG)).toBe(true)
  })

  it('reports the same bytes twice as a duplicate', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const data = await dune()
    await upload(device, 'dune.epub', data)
    expect((await upload(device, 'dune copy.epub', data)).body).toMatchObject({
      status: 'duplicate',
      title: 'Dune',
    })
    expect((await device.request({ url: '/api/books' })).json().books).toHaveLength(1)
  })

  it('never merges across Profiles, but stores the bytes once', async () => {
    h = await createHarness()
    const alice = new Device(h.app)
    const bob = new Device(h.app)
    await alice.createProfile('Alice')
    await bob.createProfile('Bob')
    const data = await dune()
    expect((await upload(alice, 'dune.epub', data)).body.status).toBe('created')
    expect((await upload(bob, 'dune.epub', data)).body.status).toBe('created')
    expect((await alice.request({ url: '/api/books' })).json().books).toHaveLength(1)
    expect((await bob.request({ url: '/api/books' })).json().books).toHaveLength(1)
    expect(blobCount(h.dataDir)).toBe(1)
  })

  it('makes a new Book for a second File of the same format', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    await upload(device, 'dune.epub', await dune())
    const other = await buildEpub({
      metadata:
        '<dc:title>Dune</dc:title><dc:creator>Frank Herbert</dc:creator><dc:subject>x</dc:subject>',
    })
    expect((await upload(device, 'dune-2.epub', other)).body.status).toBe('created')
  })

  it('stores unreadable formats with a title from the filename', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const res = await upload(device, 'Some_Manual.pdf', Buffer.from('%PDF-1.4 fake'))
    expect(res.body).toMatchObject({ status: 'created', title: 'Some Manual' })
  })

  it('fails a broken epub without storing it', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const res = await upload(device, 'broken.epub', Buffer.from('nope'))
    expect(res.body.status).toBe('failed')
    expect(fs.readdirSync(path.join(h.dataDir, 'blobs'))).toHaveLength(0)
  })

  it('rejects files over the upload limit', async () => {
    h = await createHarness({ PAPYRUS_MAX_UPLOAD_MB: '1' })
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const res = await upload(device, 'big.pdf', Buffer.alloc(1024 * 1024 + 10))
    expect(res.status).toBe(413)
  })

  it('hides other Profiles’ covers', async () => {
    h = await createHarness()
    const alice = new Device(h.app)
    const bob = new Device(h.app)
    await alice.createProfile('Alice')
    await bob.createProfile('Bob')
    await upload(alice, 'dune.epub', await dune())
    const [book] = (await alice.request({ url: '/api/books' })).json().books
    expect((await bob.request({ url: book.coverUrl })).statusCode).toBe(404)
  })

  it('deletes a Profile’s Books with the Profile', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    await upload(device, 'dune.epub', await dune())
    await device.request({
      method: 'DELETE',
      url: '/api/profiles/me',
      payload: { confirmName: 'Alice' },
    })
    const remaining = h.db.$client.prepare('select count(*) as n from books').get() as { n: number }
    expect(remaining.n).toBe(0)
  })
})
