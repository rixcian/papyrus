import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart, PNG } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'
import { buildMobi } from '../test/mobi-fixture.ts'

let h: Harness
afterEach(() => h?.close())

const duneEpub = () =>
  buildEpub({
    metadata:
      '<dc:title>Dune</dc:title><dc:creator>Frank Herbert</dc:creator><dc:subject>SF</dc:subject><dc:description>Desert.</dc:description>',
    manifest: '<item id="img" href="cover.png" media-type="image/png" properties="cover-image"/>',
    files: { 'OEBPS/cover.png': PNG },
  })
const duneMobi = () => buildMobi({ fullName: 'Dune', exth: [[100, 'Frank Herbert']] })

async function upload(device: Device, filename: string, data: Buffer) {
  const res = await device.request({
    method: 'POST',
    url: '/api/uploads',
    ...multipart(filename, data),
  })
  return res.json() as { status: string; bookId: string }
}

async function setup() {
  h = await createHarness()
  const alice = new Device(h.app)
  await alice.createProfile('Alice')
  const { bookId } = await upload(alice, 'dune.epub', await duneEpub())
  return { alice, bookId }
}

const blobFiles = () => {
  const dir = path.join(h.dataDir, 'blobs')
  return fs.readdirSync(dir).flatMap((d) => fs.readdirSync(path.join(dir, d)))
}
const coverFiles = () => fs.readdirSync(path.join(h.dataDir, 'covers'))

describe('Book detail', () => {
  it('returns metadata, tags, owner and Files', async () => {
    const { alice, bookId } = await setup()
    const res = await alice.request({ url: `/api/books/${bookId}` })
    expect(res.json()).toMatchObject({
      title: 'Dune',
      authors: ['Frank Herbert'],
      tags: ['SF'],
      description: 'Desert.',
      owned: true,
      ownerName: 'Alice',
      files: [{ format: 'epub', originalName: 'dune.epub', readable: true }],
    })
  })

  it('is invisible to other Profiles', async () => {
    const { bookId } = await setup()
    const bob = new Device(h.app)
    await bob.createProfile('Bob')
    expect((await bob.request({ url: `/api/books/${bookId}` })).statusCode).toBe(404)
    expect((await bob.request({ method: 'DELETE', url: `/api/books/${bookId}` })).statusCode).toBe(
      404,
    )
  })
})

describe('editing metadata', () => {
  it('updates fields, replaces authors and tags, and clears blanks', async () => {
    const { alice, bookId } = await setup()
    const res = await alice.request({
      method: 'PATCH',
      url: `/api/books/${bookId}`,
      payload: {
        title: 'Dune Messiah',
        authors: ['Frank Herbert', 'Brian Herbert'],
        tags: ['Classic', 'Classic'],
        seriesName: 'Dune',
        seriesIndex: 2,
        isbn: '0-441-17271-7',
        description: '   ',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      title: 'Dune Messiah',
      authors: ['Frank Herbert', 'Brian Herbert'],
      tags: ['Classic'],
      seriesName: 'Dune',
      seriesIndex: 2,
      isbn: '9780441172719',
      description: null,
    })
  })

  it('rejects an invalid ISBN', async () => {
    const { alice, bookId } = await setup()
    const res = await alice.request({
      method: 'PATCH',
      url: `/api/books/${bookId}`,
      payload: { isbn: '123' },
    })
    expect(res.json().error).toBe('invalid_isbn')
  })

  it('matches new Files on the edited title', async () => {
    const { alice, bookId } = await setup()
    await alice.request({
      method: 'PATCH',
      url: `/api/books/${bookId}`,
      payload: { title: 'Dune (Special)' },
    })
    const special = buildMobi({ fullName: 'Dune: Special', exth: [[100, 'Frank Herbert']] })
    expect((await upload(alice, 'special.mobi', special)).bookId).toBe(bookId)
  })
})

describe('Files', () => {
  it('streams a File with its type, and supports ranges', async () => {
    const { alice, bookId } = await setup()
    const [file] = (await alice.request({ url: `/api/books/${bookId}` })).json().files
    const full = await alice.request({ url: file.url })
    expect(full.statusCode).toBe(200)
    expect(full.headers['content-type']).toBe('application/epub+zip')
    expect(full.headers['content-disposition']).toContain('inline')
    const part = await alice.request({ url: file.url, headers: { range: 'bytes=0-3' } })
    expect(part.statusCode).toBe(206)
    expect(part.rawPayload.toString('latin1')).toBe('PK\u0003\u0004')
    const download = await alice.request({ url: `${file.url}?download=1` })
    expect(download.headers['content-disposition']).toBe("attachment; filename*=UTF-8''dune.epub")
  })

  it('removes a File and its blob, but never the last File', async () => {
    const { alice, bookId } = await setup()
    expect((await upload(alice, 'dune.mobi', duneMobi())).bookId).toBe(bookId)
    const files = (await alice.request({ url: `/api/books/${bookId}` })).json().files as {
      id: string
      format: string
    }[]
    expect(blobFiles()).toHaveLength(2)
    const mobi = files.find((f) => f.format === 'mobi')
    const epub = files.find((f) => f.format === 'epub')
    expect(
      (await alice.request({ method: 'DELETE', url: `/api/files/${mobi?.id}` })).statusCode,
    ).toBe(204)
    expect(blobFiles()).toHaveLength(1)
    const last = await alice.request({ method: 'DELETE', url: `/api/files/${epub?.id}` })
    expect(last.json().error).toBe('last_file')
  })
})

describe('deleting', () => {
  it('removes the Book, its cover and its blobs', async () => {
    const { alice, bookId } = await setup()
    expect(
      (await alice.request({ method: 'DELETE', url: `/api/books/${bookId}` })).statusCode,
    ).toBe(204)
    expect((await alice.request({ url: `/api/books/${bookId}` })).statusCode).toBe(404)
    expect(blobFiles()).toHaveLength(0)
    expect(coverFiles()).toHaveLength(0)
  })

  it('keeps a blob another Profile still uses', async () => {
    const { alice, bookId } = await setup()
    const bob = new Device(h.app)
    await bob.createProfile('Bob')
    await upload(bob, 'dune.epub', await duneEpub())
    await alice.request({ method: 'DELETE', url: `/api/books/${bookId}` })
    expect(blobFiles()).toHaveLength(1)
  })

  it('cleans up blobs and covers when a Profile is deleted', async () => {
    const { alice } = await setup()
    await alice.request({
      method: 'DELETE',
      url: '/api/profiles/me',
      payload: { confirmName: 'Alice' },
    })
    expect(blobFiles()).toHaveLength(0)
    expect(coverFiles()).toHaveLength(0)
  })
})
