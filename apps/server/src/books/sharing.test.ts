import { encodeHlc } from '@papyrus/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'

let h: Harness
afterEach(() => h?.close())

async function upload(device: Device, title: string): Promise<string> {
  const epub = await buildEpub({
    metadata: `<dc:title>${title}</dc:title><dc:creator>Someone</dc:creator><dc:subject>Shared tag</dc:subject>`,
  })
  const res = await device.request({
    method: 'POST',
    url: '/api/uploads',
    ...multipart(`${title}.epub`, epub),
  })
  return res.json().bookId
}

async function setup() {
  h = await createHarness()
  const alice = new Device(h.app)
  const bob = new Device(h.app)
  const aliceProfile = await alice.createProfile('Alice')
  const bobProfile = await bob.createProfile('Bob')
  const bookId = await upload(alice, 'Dune')
  return { alice, bob, aliceId: aliceProfile.id, bobId: bobProfile.id, bookId }
}

const share = (device: Device, bookId: string, mode: string, profileIds: string[] = []) =>
  device.request({
    method: 'PUT',
    url: `/api/books/${bookId}/share`,
    payload: { mode, profileIds },
  })
const hide = (device: Device, bookId: string, hidden: boolean) =>
  device.request({ method: 'PUT', url: `/api/books/${bookId}/hidden`, payload: { hidden } })
const titles = async (device: Device, query = '') =>
  (await device.request({ url: `/api/books${query}` }))
    .json()
    .books.map((b: { title: string }) => b.title)
const detail = (device: Device, bookId: string) => device.request({ url: `/api/books/${bookId}` })

describe('sharing a Book', () => {
  it('keeps an unshared Book private, down to its Files and cover', async () => {
    const { alice, bob, bookId } = await setup()
    expect(await titles(bob)).toEqual([])
    expect((await detail(bob, bookId)).statusCode).toBe(404)
    const fileId = (await detail(alice, bookId)).json().files[0].id
    expect((await bob.request({ url: `/api/files/${fileId}` })).statusCode).toBe(404)
    expect((await bob.request({ url: `/api/books/${bookId}/cover` })).statusCode).toBe(404)
  })

  it('Shares with everyone, including Profiles created later, read-only', async () => {
    const { alice, bob, bookId } = await setup()
    expect((await share(alice, bookId, 'everyone')).json()).toEqual({
      mode: 'everyone',
      profiles: [],
    })
    const carol = new Device(h.app)
    await carol.createProfile('Carol')
    for (const recipient of [bob, carol]) {
      const books = (await recipient.request({ url: '/api/books' })).json().books
      expect(books).toMatchObject([{ title: 'Dune', owned: false, sharedBy: 'Alice' }])
      const book = (await detail(recipient, bookId)).json()
      expect(book).toMatchObject({ owned: false, sharedBy: 'Alice', share: null })
      expect((await recipient.request({ url: book.files[0].url })).statusCode).toBe(200)
    }
    // Recipients can read, never change.
    const patch = await bob.request({
      method: 'PATCH',
      url: `/api/books/${bookId}`,
      payload: { title: 'Mine now' },
    })
    expect(patch.statusCode).toBe(403)
    expect((await bob.request({ method: 'DELETE', url: `/api/books/${bookId}` })).statusCode).toBe(
      403,
    )
    expect((await share(bob, bookId, 'none')).statusCode).toBe(403)
    const fileId = (await detail(alice, bookId)).json().files[0].id
    expect((await bob.request({ method: 'DELETE', url: `/api/files/${fileId}` })).statusCode).toBe(
      403,
    )
  })

  it('Shares with named Profiles only, and only the owner sees with whom', async () => {
    const { alice, bob, bobId, bookId } = await setup()
    const carol = new Device(h.app)
    await carol.createProfile('Carol')
    expect((await share(alice, bookId, 'named', [bobId])).json()).toEqual({
      mode: 'named',
      profiles: [{ id: bobId, name: 'Bob' }],
    })
    expect(await titles(bob)).toEqual(['Dune'])
    expect(await titles(carol)).toEqual([])
    expect((await detail(carol, bookId)).statusCode).toBe(404)
    expect((await detail(alice, bookId)).json().share).toEqual({
      mode: 'named',
      profiles: [{ id: bobId, name: 'Bob' }],
    })
    expect((await detail(bob, bookId)).json().share).toBeNull()
  })

  it('rejects unknown Profiles and treats an empty named Share as none', async () => {
    const { alice, bookId } = await setup()
    expect((await share(alice, bookId, 'named', ['nobody'])).statusCode).toBe(400)
    expect((await share(alice, bookId, 'named', [])).json()).toEqual({ mode: 'none', profiles: [] })
  })

  it('forgets a Recipient whose Profile is deleted', async () => {
    const { alice, bob, bobId, bookId } = await setup()
    await share(alice, bookId, 'named', [bobId])
    await bob.request({
      method: 'DELETE',
      url: '/api/profiles/me',
      payload: { confirmName: 'Bob' },
    })
    expect((await detail(alice, bookId)).json().share).toEqual({ mode: 'none', profiles: [] })
  })

  it('removes the Book for everyone when the owner deletes it', async () => {
    const { alice, bob, bookId } = await setup()
    await share(alice, bookId, 'everyone')
    await alice.request({ method: 'DELETE', url: `/api/books/${bookId}` })
    expect(await titles(bob)).toEqual([])
  })
})

describe('the library with Shared Books', () => {
  it('filters by scope and counts Shared Books in the facets', async () => {
    const { alice, bob, bookId } = await setup()
    await upload(bob, 'Bob’s own')
    await share(alice, bookId, 'everyone')
    expect(await titles(bob, '?scope=mine')).toEqual(['Bob’s own'])
    expect(await titles(bob, '?scope=shared')).toEqual(['Dune'])
    expect((await titles(bob)).sort()).toEqual(['Bob’s own', 'Dune'])
    const facets = (await bob.request({ url: '/api/books/facets' })).json()
    expect(facets).toMatchObject({ shared: 1, hidden: 0, tags: [{ name: 'Shared tag', count: 2 }] })
    expect((await bob.request({ url: '/api/books?q=dune' })).json().total).toBe(1)
  })

  it('counts a Shared Book as added when it was Shared', async () => {
    const { alice, bob, bookId } = await setup()
    await new Promise((r) => setTimeout(r, 5))
    await upload(bob, 'Bob’s own')
    await new Promise((r) => setTimeout(r, 5))
    await share(alice, bookId, 'everyone')
    const books = (await bob.request({ url: '/api/books' })).json().books
    expect(books.map((b: { title: string }) => b.title)).toEqual(['Dune', 'Bob’s own'])
    const ownAdded = (await detail(alice, bookId)).json().addedAt
    expect(books[0].addedAt).toBeGreaterThan(ownAdded)
  })
})

describe('hiding and revoking', () => {
  it('lets a Recipient hide and unhide a Shared Book, but not the owner', async () => {
    const { alice, bob, bookId } = await setup()
    await share(alice, bookId, 'everyone')
    expect((await hide(alice, bookId, true)).statusCode).toBe(409)
    expect((await hide(bob, bookId, true)).statusCode).toBe(204)
    expect(await titles(bob)).toEqual([])
    expect(await titles(bob, '?hidden=true')).toEqual(['Dune'])
    expect((await bob.request({ url: '/api/books/facets' })).json()).toMatchObject({
      shared: 0,
      hidden: 1,
      tags: [],
    })
    // Still reachable, so it can be unhidden from Book detail.
    expect((await detail(bob, bookId)).json().hidden).toBe(true)
    await hide(bob, bookId, false)
    expect(await titles(bob)).toEqual(['Dune'])
  })

  it('keeps reading state and the hidden marker through a revoke and re-Share', async () => {
    const { alice, bob, bobId, bookId } = await setup()
    await share(alice, bookId, 'named', [bobId])
    await bob.request({
      method: 'POST',
      url: '/api/sync',
      payload: {
        profileId: bobId,
        deviceId: 'phone',
        cursor: 0,
        changes: [
          {
            kind: 'readStatus',
            bookId,
            status: 'finished',
            hlc: encodeHlc({ wall: Date.now(), counter: 0, node: 'phone' }),
          },
        ],
      },
    })
    await hide(bob, bookId, true)

    await share(alice, bookId, 'none')
    expect((await detail(bob, bookId)).statusCode).toBe(404)
    expect(await titles(bob, '?hidden=true')).toEqual([])

    await share(alice, bookId, 'everyone')
    expect(await titles(bob)).toEqual([])
    expect((await detail(bob, bookId)).json()).toMatchObject({
      hidden: true,
      readStatus: 'finished',
    })
  })
})
