import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'
import { buildMobi } from '../test/mobi-fixture.ts'

let h: Harness
afterEach(() => h?.close())

const duneEpub = (extra = '') =>
  buildEpub({
    metadata: `<dc:title>Dune</dc:title><dc:creator>Frank Herbert</dc:creator><meta name="calibre:series" content="Dune Chronicles"/><meta name="calibre:series_index" content="1"/>${extra}`,
  })

async function upload(device: Device, filename: string, data: Buffer) {
  const res = await device.request({
    method: 'POST',
    url: '/api/uploads',
    ...multipart(filename, data),
  })
  return res.json() as { status: string; bookId?: string; title?: string }
}

async function books(device: Device) {
  return (await device.request({ url: '/api/books' })).json().books as {
    id: string
    title: string
    formats: string[]
    seriesName: string | null
  }[]
}

function bookRow(h: Harness, id: string) {
  return h.db.$client.prepare('select * from books where id = ?').get(id) as Record<string, unknown>
}

describe('attaching Files to an existing Book', () => {
  it('attaches a mobi by ISBN and keeps the epub’s series', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const epub = await upload(
      device,
      'dune.epub',
      await duneEpub('<dc:identifier>urn:isbn:9780441172719</dc:identifier>'),
    )
    const mobi = await upload(
      device,
      'dune.mobi',
      buildMobi({ fullName: 'Dune (Kindle Edition)', exth: [[104, '9780441172719']] }),
    )
    expect(mobi).toMatchObject({ status: 'attached', bookId: epub.bookId, title: 'Dune' })
    const [book] = await books(device)
    expect(book?.formats.sort()).toEqual(['epub', 'mobi'])
    expect(book?.seriesName).toBe('Dune Chronicles')
  })

  it('attaches by folded title + first author when there is no ISBN', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const epub = await upload(device, 'dune.epub', await duneEpub())
    const azw3 = await upload(
      device,
      'dune.azw3',
      buildMobi({ fullName: 'DUNE', exth: [[100, 'frank herbert']] }),
    )
    expect(azw3).toMatchObject({ status: 'attached', bookId: epub.bookId })
  })

  it('fills only empty fields from the attached File', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const epub = await upload(
      device,
      'dune.epub',
      await duneEpub('<dc:publisher>Ace</dc:publisher>'),
    )
    await upload(
      device,
      'dune.mobi',
      buildMobi({
        fullName: 'Dune',
        exth: [
          [100, 'Frank Herbert'],
          [101, 'Other Publisher'],
          [103, 'A desert planet.'],
        ],
      }),
    )
    const row = bookRow(h, epub.bookId as string)
    expect(row.publisher).toBe('Ace')
    expect(row.description).toBe('A desert planet.')
  })

  it('makes a new Book when the match already has that format', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const mobi = (n: string) =>
      buildMobi({
        fullName: 'Dune',
        exth: [
          [100, 'Frank Herbert'],
          [106, n],
        ],
      })
    expect((await upload(device, 'a.mobi', mobi('1965'))).status).toBe('created')
    expect((await upload(device, 'b.mobi', mobi('1966'))).status).toBe('created')
    expect(await books(device)).toHaveLength(2)
  })

  it('never attaches to another Profile’s Book', async () => {
    h = await createHarness()
    const alice = new Device(h.app)
    const bob = new Device(h.app)
    await alice.createProfile('Alice')
    await bob.createProfile('Bob')
    await upload(alice, 'dune.epub', await duneEpub())
    const res = await upload(
      bob,
      'dune.mobi',
      buildMobi({ fullName: 'Dune', exth: [[100, 'Frank Herbert']] }),
    )
    expect(res.status).toBe('created')
  })

  it('fails a file named .mobi that is not one', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    expect((await upload(device, 'fake.mobi', Buffer.alloc(300))).status).toBe('failed')
  })
})
