import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'

let h: Harness
afterEach(() => h?.close())

async function upload(device: Device, title: string): Promise<string> {
  const epub = await buildEpub({ metadata: `<dc:title>${title}</dc:title>` })
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
  await alice.createProfile('Alice')
  return { alice, dune: await upload(alice, 'Dune'), emma: await upload(alice, 'Emma') }
}

const createShelf = (device: Device, name: string) =>
  device.request({ method: 'POST', url: '/api/shelves', payload: { name } })
const shelfBooks = (device: Device, shelfId: string, add: string[], remove: string[] = []) =>
  device.request({ method: 'POST', url: `/api/shelves/${shelfId}/books`, payload: { add, remove } })
const listShelves = async (device: Device) =>
  (await device.request({ url: '/api/shelves' })).json().shelves
const titlesOn = async (device: Device, shelfId: string) =>
  (await device.request({ url: `/api/books?shelf=${shelfId}&sort=title` }))
    .json()
    .books.map((b: { title: string }) => b.title)

describe('shelves', () => {
  it('creates, renames and deletes shelves, with unique names per Profile', async () => {
    const { alice } = await setup()
    const res = await createShelf(alice, '  To   read ')
    expect(res.statusCode).toBe(201)
    const shelf = res.json()
    expect(shelf).toMatchObject({ name: 'To read', count: 0 })
    expect((await createShelf(alice, 'to READ')).statusCode).toBe(409)
    expect((await createShelf(alice, '')).statusCode).toBe(400)

    const renamed = await alice.request({
      method: 'PATCH',
      url: `/api/shelves/${shelf.id}`,
      payload: { name: 'TO READ' },
    })
    expect(renamed.json()).toMatchObject({ name: 'TO READ' })
    await createShelf(alice, 'Favourites')
    expect((await listShelves(alice)).map((s: { name: string }) => s.name)).toEqual([
      'Favourites',
      'TO READ',
    ])
    await alice.request({ method: 'DELETE', url: `/api/shelves/${shelf.id}` })
    expect(await listShelves(alice)).toHaveLength(1)
  })

  it('adds and removes Books in bulk, and filters the library by shelf', async () => {
    const { alice, dune, emma } = await setup()
    const shelf = (await createShelf(alice, 'Favourites')).json()
    expect((await shelfBooks(alice, shelf.id, [dune, emma, dune])).json()).toMatchObject({
      count: 2,
    })
    expect(await titlesOn(alice, shelf.id)).toEqual(['Dune', 'Emma'])
    expect((await alice.request({ url: `/api/books/${dune}` })).json().shelves).toEqual([
      { id: shelf.id, name: 'Favourites' },
    ])
    await shelfBooks(alice, shelf.id, [], [emma])
    expect(await titlesOn(alice, shelf.id)).toEqual(['Dune'])
    // Deleting the shelf leaves the Books alone.
    await alice.request({ method: 'DELETE', url: `/api/shelves/${shelf.id}` })
    expect((await alice.request({ url: '/api/books' })).json().total).toBe(2)
  })

  it('keeps shelves private, and only holds Books the Profile can see', async () => {
    const { alice, dune } = await setup()
    const shelf = (await createShelf(alice, 'Favourites')).json()
    const bob = new Device(h.app)
    await bob.createProfile('Bob')
    expect(await listShelves(bob)).toEqual([])
    expect((await shelfBooks(bob, shelf.id, [])).statusCode).toBe(404)
    expect(await titlesOn(bob, shelf.id)).toEqual([])
    const bobShelf = (await createShelf(bob, 'Favourites')).json()
    expect((await shelfBooks(bob, bobShelf.id, [dune])).statusCode).toBe(404)
  })

  it('hides a Shared Book on a shelf while the Share is revoked, and brings it back', async () => {
    const { alice, dune } = await setup()
    const bob = new Device(h.app)
    await bob.createProfile('Bob')
    const share = (mode: string) =>
      alice.request({ method: 'PUT', url: `/api/books/${dune}/share`, payload: { mode } })
    await share('everyone')
    const shelf = (await createShelf(bob, 'From Alice')).json()
    await shelfBooks(bob, shelf.id, [dune])
    expect(await titlesOn(bob, shelf.id)).toEqual(['Dune'])

    await share('none')
    expect(await titlesOn(bob, shelf.id)).toEqual([])
    expect((await listShelves(bob))[0].count).toBe(0)
    await share('everyone')
    expect(await titlesOn(bob, shelf.id)).toEqual(['Dune'])
  })

  it('drops shelf entries when the Book is deleted', async () => {
    const { alice, dune } = await setup()
    const shelf = (await createShelf(alice, 'Favourites')).json()
    await shelfBooks(alice, shelf.id, [dune])
    await alice.request({ method: 'DELETE', url: `/api/books/${dune}` })
    expect((await listShelves(alice))[0].count).toBe(0)
  })
})
