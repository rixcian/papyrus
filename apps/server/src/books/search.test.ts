import { encodeHlc } from '@papyrus/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'
import { ftsQuery } from './search.ts'

let h: Harness
afterEach(() => h?.close())

interface Seed {
  title: string
  authors?: string[]
  series?: [string, number]
  tags?: string[]
  description?: string
}

function opf({ title, authors = [], series, tags = [], description }: Seed): string {
  return [
    `<dc:title>${title}</dc:title>`,
    ...authors.map((a) => `<dc:creator>${a}</dc:creator>`),
    ...tags.map((t) => `<dc:subject>${t}</dc:subject>`),
    description ? `<dc:description>${description}</dc:description>` : '',
    series
      ? `<meta name="calibre:series" content="${series[0]}"/><meta name="calibre:series_index" content="${series[1]}"/>`
      : '',
  ].join('')
}

const LIBRARY: Seed[] = [
  {
    title: 'Dune',
    authors: ['Frank Herbert'],
    series: ['Dune', 1],
    tags: ['Science Fiction'],
    description: 'A desert planet and its spice.',
  },
  {
    title: 'Children of Dune',
    authors: ['Frank Herbert'],
    series: ['Dune', 3],
    tags: ['Science Fiction'],
  },
  {
    title: 'Dune Messiah',
    authors: ['Frank Herbert'],
    series: ['Dune', 2],
    tags: ['Science Fiction'],
  },
  {
    title: 'The Left Hand of Darkness',
    authors: ['Ursula K. Le Guin'],
    tags: ['Science Fiction', 'Classic'],
  },
  { title: 'Cien años de soledad', authors: ['Gabriel García Márquez'], tags: ['Classic'] },
  {
    title: 'A Wizard of Earthsea',
    authors: ['Ursula K. Le Guin'],
    description: 'Ged learns about dunes of power.',
  },
]

async function setup(seeds = LIBRARY) {
  h = await createHarness()
  const device = new Device(h.app)
  await device.createProfile('Alice')
  const ids: Record<string, string> = {}
  for (const seed of seeds) {
    const epub = await buildEpub({ metadata: opf(seed) })
    const res = await device.request({
      method: 'POST',
      url: '/api/uploads',
      ...multipart(`${seed.title}.epub`, epub),
    })
    ids[seed.title] = res.json().bookId
  }
  return { device, ids }
}

async function list(device: Device, query: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
  )
  const res = await device.request({ url: `/api/books?${qs}` })
  expect(res.statusCode).toBe(200)
  const body = res.json() as {
    books: { id: string; title: string }[]
    total: number
    nextCursor: string | null
  }
  return { ...body, titles: body.books.map((b) => b.title) }
}

describe('ftsQuery', () => {
  it('makes every word a prefix and strips FTS syntax', () => {
    expect(ftsQuery('dune mess')).toBe('"dune"* "mess"*')
    expect(ftsQuery('"title:x" OR (y)')).toBe('"title:x"* "OR"* "(y)"*')
    expect(ftsQuery('  - * ')).toBeUndefined()
  })
})

describe('library search', () => {
  it('matches prefixes across title, authors, series, tags and description, best first', async () => {
    const { device } = await setup()
    const { titles } = await list(device, { q: 'dun' })
    expect(titles.slice(0, 3).sort()).toEqual(['Children of Dune', 'Dune', 'Dune Messiah'])
    // A description match ranks below title and series matches.
    expect(titles.at(-1)).toBe('A Wizard of Earthsea')

    expect((await list(device, { q: 'le guin' })).titles.sort()).toEqual([
      'A Wizard of Earthsea',
      'The Left Hand of Darkness',
    ])
    expect((await list(device, { q: 'classic' })).total).toBe(2)
  })

  it('ignores accents and case', async () => {
    const { device } = await setup()
    expect((await list(device, { q: 'MARQUEZ anos' })).titles).toEqual(['Cien años de soledad'])
  })

  it('returns nothing for a query with no words', async () => {
    const { device } = await setup()
    expect(await list(device, { q: '"*' })).toMatchObject({ books: [], total: 0 })
  })

  it('follows metadata edits and deletes', async () => {
    const { device, ids } = await setup()
    const id = ids['A Wizard of Earthsea'] as string
    await device.request({
      method: 'PATCH',
      url: `/api/books/${id}`,
      payload: { authors: ['Ged Sparrowhawk'], tags: ['Archipelago'], seriesName: 'Earthsea' },
    })
    expect((await list(device, { q: 'sparrowhawk' })).titles).toEqual(['A Wizard of Earthsea'])
    expect((await list(device, { q: 'archipelago earthsea' })).total).toBe(1)
    expect((await list(device, { q: 'le guin' })).titles).toEqual(['The Left Hand of Darkness'])

    await device.request({ method: 'DELETE', url: `/api/books/${id}` })
    expect((await list(device, { q: 'earthsea' })).total).toBe(0)
  })

  it("never shows another Profile's Books", async () => {
    const { device } = await setup(LIBRARY.slice(0, 1))
    const bob = new Device(h.app)
    await bob.createProfile('Bob')
    expect((await list(bob, { q: 'dune' })).total).toBe(0)
    expect((await bob.request({ url: '/api/books/facets' })).json()).toEqual({
      authors: [],
      series: [],
      tags: [],
      shared: 0,
      hidden: 0,
    })
    expect((await list(device, { q: 'dune' })).total).toBe(1)
  })
})

describe('library filters and sorting', () => {
  it('filters by author, series and tag', async () => {
    const { device } = await setup()
    expect((await list(device, { author: 'Ursula K. Le Guin' })).total).toBe(2)
    expect((await list(device, { tag: 'Classic', author: 'Ursula K. Le Guin' })).titles).toEqual([
      'The Left Hand of Darkness',
    ])
    // A series filter sorts by series index.
    expect((await list(device, { series: 'Dune' })).titles).toEqual([
      'Dune',
      'Dune Messiah',
      'Children of Dune',
    ])
  })

  it('sorts by title, author and recently added', async () => {
    const { device } = await setup()
    expect((await list(device, { sort: 'title' })).titles).toEqual([
      'Children of Dune',
      'Cien años de soledad',
      'Dune',
      'Dune Messiah',
      'The Left Hand of Darkness',
      'A Wizard of Earthsea',
    ])
    expect((await list(device, { sort: 'author' })).titles.slice(0, 2)).toEqual([
      'Children of Dune',
      'Dune',
    ])
    expect((await list(device)).titles[0]).toBe('A Wizard of Earthsea')
  })

  it('filters by Read Status and sorts by the newest Reading Progress', async () => {
    const { device, ids } = await setup()
    const profileId = (await device.request({ url: '/api/session' })).json().profile.id
    const fileOf = async (title: string) =>
      (await device.request({ url: `/api/books/${ids[title]}` })).json().files[0].id
    const now = Date.now()
    const changes = [
      { title: 'Dune', at: now - 2000 },
      { title: 'Dune Messiah', at: now - 1000 },
    ].map(async ({ title, at }) => ({
      kind: 'progress',
      fileId: await fileOf(title),
      cfi: 'epubcfi(/6/4)',
      fraction: 0.3,
      hlc: encodeHlc({ wall: at, counter: 0, node: 'phone' }),
    }))
    await device.request({
      method: 'POST',
      url: '/api/sync',
      payload: { profileId, deviceId: 'phone', cursor: 0, changes: await Promise.all(changes) },
    })

    expect((await list(device, { status: 'reading', sort: 'recent' })).titles).toEqual([
      'Dune Messiah',
      'Dune',
    ])
    expect((await list(device, { status: 'unread' })).total).toBe(4)
  })

  it('pages with a cursor', async () => {
    const { device } = await setup()
    const first = await list(device, { sort: 'title', limit: 4 })
    expect(first).toMatchObject({ total: 6, nextCursor: '4' })
    const second = await list(device, { sort: 'title', limit: 4, cursor: first.nextCursor ?? '' })
    expect(second.titles).toEqual(['The Left Hand of Darkness', 'A Wizard of Earthsea'])
    expect(second.nextCursor).toBeNull()
  })
})

describe('GET /api/books/facets', () => {
  it('counts Books per author, series and tag', async () => {
    const { device } = await setup()
    const facets = (await device.request({ url: '/api/books/facets' })).json()
    expect(facets.authors).toEqual([
      { name: 'Frank Herbert', count: 3 },
      { name: 'Gabriel García Márquez', count: 1 },
      { name: 'Ursula K. Le Guin', count: 2 },
    ])
    expect(facets.series).toEqual([{ name: 'Dune', count: 3 }])
    expect(facets.tags).toEqual([
      { name: 'Classic', count: 2 },
      { name: 'Science Fiction', count: 4 },
    ])
  })
})
