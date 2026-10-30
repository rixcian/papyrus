import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, PNG } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'

let h: Harness
let importDir: string
afterEach(async () => {
  await h?.close()
  fs.rmSync(importDir, { recursive: true, force: true })
})

async function setup(env: Record<string, string> = {}) {
  importDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-import-'))
  h = await createHarness({ PAPYRUS_IMPORT_DIR: importDir, ...env })
  const alice = new Device(h.app)
  await alice.createProfile('Alice')
  const scan = () => h.app.importScanner?.scan()
  const titles = async () =>
    (await alice.request({ url: '/api/books?sort=title' }))
      .json()
      .books.map((b: { title: string }) => b.title)
  const imports = async () => (await alice.request({ url: '/api/imports' })).json()
  return { alice, scan, titles, imports, folder: path.join(importDir, 'Alice') }
}

const epub = (title: string, author = 'Someone') =>
  buildEpub({ metadata: `<dc:title>${title}</dc:title><dc:creator>${author}</dc:creator>` })

describe('the import folder', () => {
  it('creates a folder per Profile and renames it with the Profile', async () => {
    const { alice, folder } = await setup()
    expect(fs.existsSync(folder)).toBe(true)
    fs.writeFileSync(path.join(folder, 'keep.txt'), 'x')
    await alice.request({ method: 'PATCH', url: '/api/profiles/me', payload: { name: 'Alicia' } })
    expect(fs.existsSync(path.join(importDir, 'Alicia', 'keep.txt'))).toBe(true)
    expect(fs.existsSync(folder)).toBe(false)
  })

  it('imports a file once it has stayed the same for two scans, and only once', async () => {
    const { alice, scan, titles, imports, folder } = await setup()
    fs.mkdirSync(path.join(folder, 'sci-fi'))
    fs.writeFileSync(path.join(folder, 'sci-fi', 'dune.epub'), await epub('Dune'))
    await scan()
    expect(await titles()).toEqual([])
    await scan()
    expect(await titles()).toEqual(['Dune'])
    expect(await imports()).toMatchObject({
      enabled: true,
      folder: 'Alice',
      records: [{ path: 'sci-fi/dune.epub', status: 'created', title: 'Dune' }],
    })

    // Deleting the Book in the app doesn't bring it back from the folder.
    const [book] = (await alice.request({ url: '/api/books' })).json().books
    await alice.request({ method: 'DELETE', url: `/api/books/${book.id}` })
    await scan()
    await scan()
    expect(await titles()).toEqual([])
  })

  it('waits while a file is still being written', async () => {
    const { scan, titles, folder } = await setup()
    const file = path.join(folder, 'emma.epub')
    const data = await epub('Emma')
    fs.writeFileSync(file, data.subarray(0, 100))
    await scan()
    fs.writeFileSync(file, data)
    await scan()
    expect(await titles()).toEqual([])
    await scan()
    expect(await titles()).toEqual(['Emma'])
  })

  it('records failures and retries only when the file changes', async () => {
    const { scan, titles, imports, folder } = await setup()
    const file = path.join(folder, 'broken.epub')
    fs.writeFileSync(file, 'not a zip')
    await scan()
    await scan()
    expect((await imports()).records).toMatchObject([{ path: 'broken.epub', status: 'failed' }])
    fs.writeFileSync(file, await epub('Fixed'))
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000))
    await scan()
    await scan()
    expect(await titles()).toEqual(['Fixed'])
    expect((await imports()).records).toMatchObject([{ status: 'created' }])
  })

  it('ignores files outside a Profile folder, and partial downloads', async () => {
    const { scan, titles, folder } = await setup()
    fs.writeFileSync(path.join(importDir, 'stray.epub'), await epub('Stray'))
    fs.mkdirSync(path.join(importDir, 'Nobody'))
    fs.writeFileSync(path.join(importDir, 'Nobody', 'x.epub'), await epub('Nobody’s'))
    fs.writeFileSync(path.join(folder, 'half.epub.part'), 'x')
    fs.writeFileSync(path.join(folder, '.DS_Store'), 'x')
    await scan()
    await scan()
    expect(await titles()).toEqual([])
  })

  it("keeps each Profile's imports in its own library", async () => {
    const { scan, titles } = await setup()
    const bob = new Device(h.app)
    await bob.createProfile('Bob')
    fs.writeFileSync(path.join(importDir, 'Bob', 'b.epub'), await epub('Bob’s book'))
    await scan()
    await scan()
    expect(await titles()).toEqual([])
    expect((await bob.request({ url: '/api/books' })).json().books).toMatchObject([
      { title: 'Bob’s book' },
    ])
  })

  it('makes a Calibre folder one Book with the OPF metadata and cover.jpg', async () => {
    const { alice, scan, folder } = await setup()
    const book = path.join(folder, 'Frank Herbert', 'Dune (12)')
    fs.mkdirSync(book, { recursive: true })
    fs.writeFileSync(
      path.join(book, 'metadata.opf'),
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0"><metadata>
        <dc:title>Dune</dc:title><dc:creator opf:role="aut" xmlns:opf="http://www.idpf.org/2007/opf">Frank Herbert</dc:creator>
        <dc:subject>Classic</dc:subject>
        <meta name="calibre:series" content="Dune Chronicles"/><meta name="calibre:series_index" content="1"/>
      </metadata></package>`,
    )
    fs.writeFileSync(path.join(book, 'cover.jpg'), PNG)
    fs.writeFileSync(path.join(book, 'Dune - Frank Herbert.epub'), await epub('wrong title', 'x'))
    fs.writeFileSync(path.join(book, 'Dune - Frank Herbert.pdf'), '%PDF-1.4')
    await scan()
    await scan()
    const { books } = (await alice.request({ url: '/api/books' })).json()
    expect(books).toHaveLength(1)
    expect(books[0]).toMatchObject({
      title: 'Dune',
      authors: ['Frank Herbert'],
      seriesName: 'Dune Chronicles',
      seriesIndex: 1,
      formats: expect.arrayContaining(['epub', 'pdf']),
    })
    expect(books[0].coverUrl).not.toBeNull()
    const detail = (await alice.request({ url: `/api/books/${books[0].id}` })).json()
    expect(detail.tags).toEqual(['Classic'])
  })

  it('deletes sources after import when asked to, Calibre folders included', async () => {
    const { scan, titles, folder } = await setup({ PAPYRUS_IMPORT_DELETE_SOURCE: 'true' })
    fs.writeFileSync(path.join(folder, 'emma.epub'), await epub('Emma'))
    const calibre = path.join(folder, 'Austen', 'Persuasion (3)')
    fs.mkdirSync(calibre, { recursive: true })
    fs.writeFileSync(
      path.join(calibre, 'metadata.opf'),
      '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Persuasion</dc:title><dc:creator>Jane Austen</dc:creator></metadata></package>',
    )
    fs.writeFileSync(path.join(calibre, 'p.epub'), await epub('Persuasion', 'Jane Austen'))
    await scan()
    await scan()
    expect(await titles()).toEqual(['Emma', 'Persuasion'])
    expect(fs.existsSync(path.join(folder, 'emma.epub'))).toBe(false)
    expect(fs.existsSync(calibre)).toBe(false)
    expect(fs.existsSync(folder)).toBe(true)
  })

  it('reports the import folder as off when none is configured', async () => {
    importDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-import-'))
    h = await createHarness()
    const alice = new Device(h.app)
    await alice.createProfile('Alice')
    expect((await alice.request({ url: '/api/imports' })).json()).toMatchObject({
      enabled: false,
      folder: null,
      records: [],
    })
  })
})
