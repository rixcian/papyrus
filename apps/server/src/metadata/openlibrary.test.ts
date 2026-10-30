import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart, PNG } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'
import { OpenLibrary } from './openlibrary.ts'

/** Canned Open Library answers, shaped like the real ones; anything else is a 404. */
const ROUTES: Record<string, unknown> = {
  '/isbn/9780441172719.json': {
    title: 'Dune',
    publishers: ['Ace Books'],
    publish_date: '1987',
    languages: [{ key: '/languages/eng' }],
    covers: [15166231],
    works: [{ key: '/works/OL893415W' }],
  },
  '/works/OL893415W.json': {
    key: '/works/OL893415W',
    type: { key: '/type/redirect' },
    location: '/works/OL893414W',
  },
  '/works/OL893414W.json': {
    description: { type: '/type/text', value: 'Set on the desert planet Arrakis.' },
  },
  '/works/OL2W.json': { description: 'The second book.' },
}

const SEARCH_DOCS = [
  {
    key: '/works/OL893414W',
    title: 'Dune',
    author_name: ['Frank Herbert'],
    first_publish_year: 1965,
    publisher: ['Chilton Books'],
    isbn: ['0441172717', '9780441172719'],
    cover_i: 11481354,
    language: ['eng'],
    subject: ['Science fiction', 'Desert'],
  },
  {
    key: '/works/OL2W',
    title: 'Dune Messiah',
    author_name: ['Frank Herbert'],
    cover_i: -1,
    // Many editions: none of these can be offered as the Book's own.
    publisher: ['Putnam', 'Ace'],
    isbn: ['0399101679', '9780399101670', '0441172695'],
    language: ['eng', 'ita'],
  },
]

function fakeFetch(calls: string[] = []) {
  return (async (input: string | URL) => {
    const url = new URL(String(input))
    calls.push(url.pathname + url.search)
    if (url.hostname === 'covers.openlibrary.org')
      return url.pathname === '/b/id/15166231-L.jpg' || url.pathname === '/b/id/15166231-M.jpg'
        ? new Response(PNG, { headers: { 'content-type': 'image/png' } })
        : new Response('', { status: 404 })
    if (url.pathname === '/search.json') {
      const isbn = url.searchParams.get('isbn')
      const docs =
        isbn === null ? SEARCH_DOCS : isbn === '9780441172719' ? SEARCH_DOCS.slice(0, 1) : []
      return Response.json({ docs })
    }
    const body = ROUTES[url.pathname]
    return body ? Response.json(body) : new Response('{}', { status: 404 })
  }) as typeof fetch
}

describe('OpenLibrary', () => {
  it('builds one candidate from an ISBN: edition, search and the redirected work', async () => {
    const calls: string[] = []
    const ol = new OpenLibrary(fakeFetch(calls))
    expect(await ol.lookup({ isbn: '978-0-441-17271-9', title: 'ignored' })).toEqual([
      {
        key: '/works/OL893415W',
        title: 'Dune',
        authors: ['Frank Herbert'],
        description: 'Set on the desert planet Arrakis.',
        publisher: 'Ace Books',
        publishedDate: '1987',
        isbn: '9780441172719',
        language: 'en',
        tags: ['Science fiction', 'Desert'],
        coverId: 15166231,
      },
    ])
    expect(calls.some((c) => c.startsWith('/search.json?title'))).toBe(false)
  })

  it('searches by title and author when there is no ISBN, or it is unknown', async () => {
    const ol = new OpenLibrary(fakeFetch())
    const found = await ol.lookup({ isbn: '9780000000002', title: 'dune', author: 'herbert' })
    expect(found.map((c) => c.title)).toEqual(['Dune', 'Dune Messiah'])
    expect(found[0]).toMatchObject({
      isbn: '9780441172719',
      publisher: 'Chilton Books',
      publishedDate: '1965',
      language: 'en',
    })
    expect(found[1]).toMatchObject({
      description: 'The second book.',
      coverId: null,
      publisher: null,
      isbn: null,
      language: null,
    })
    expect(await ol.lookup({})).toEqual([])
  })

  it('reports an unreachable Open Library as a LookupError', async () => {
    const ol = new OpenLibrary((async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch)
    await expect(ol.lookup({ title: 'x' })).rejects.toThrow('Couldn’t reach Open Library')
  })
})

describe('Find online routes', () => {
  let h: Harness
  afterEach(() => h?.close())

  async function setup(fetchImpl = fakeFetch()) {
    h = await createHarness({}, { openLibrary: new OpenLibrary(fetchImpl) })
    const alice = new Device(h.app)
    await alice.createProfile('Alice')
    const epub = await buildEpub({ metadata: '<dc:title>Dune</dc:title>' })
    const bookId = (
      await alice.request({ method: 'POST', url: '/api/uploads', ...multipart('d.epub', epub) })
    ).json().bookId as string
    return { alice, bookId }
  }

  it('looks up candidates and proxies cover previews', async () => {
    const { alice } = await setup()
    const res = await alice.request({ url: '/api/metadata/lookup?isbn=9780441172719' })
    expect(res.json().candidates[0]).toMatchObject({ title: 'Dune', coverId: 15166231 })
    const preview = await alice.request({ url: '/api/metadata/cover/15166231?size=M' })
    expect(preview.statusCode).toBe(200)
    expect(preview.rawPayload.equals(PNG)).toBe(true)
    expect((await alice.request({ url: '/api/metadata/cover/42' })).statusCode).toBe(404)
  })

  it('answers 502 when Open Library is down', async () => {
    const { alice } = await setup((async () => new Response('', { status: 503 })) as typeof fetch)
    const res = await alice.request({ url: '/api/metadata/lookup?title=dune' })
    expect(res.statusCode).toBe(502)
    expect(res.json().error).toBe('lookup_failed')
  })

  it('downloads a chosen cover onto the Book, for its owner only', async () => {
    const { alice, bookId } = await setup()
    const before = (await alice.request({ url: `/api/books/${bookId}` })).json()
    expect(before.coverUrl).toBeNull()
    const put = await alice.request({
      method: 'PUT',
      url: `/api/books/${bookId}/cover`,
      payload: { coverId: 15166231 },
    })
    expect(put.statusCode).toBe(204)
    const after = (await alice.request({ url: `/api/books/${bookId}` })).json()
    expect((await alice.request({ url: after.coverUrl })).rawPayload.equals(PNG)).toBe(true)

    await alice.request({
      method: 'PUT',
      url: `/api/books/${bookId}/share`,
      payload: { mode: 'everyone' },
    })
    const bob = new Device(h.app)
    await bob.createProfile('Bob')
    const denied = await bob.request({
      method: 'PUT',
      url: `/api/books/${bookId}/cover`,
      payload: { coverId: 15166231 },
    })
    expect(denied.statusCode).toBe(403)
  })
})
