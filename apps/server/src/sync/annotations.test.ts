import { encodeHlc } from '@papyrus/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, multipart } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'
import { buildMobi } from '../test/mobi-fixture.ts'
import { highlightsMarkdown } from './export.ts'

let h: Harness
afterEach(() => h?.close())

const NOW = Date.now()
const at = (offset: number) => encodeHlc({ wall: NOW + offset, counter: 0, node: 'phone' })

async function setup() {
  h = await createHarness()
  const device = new Device(h.app)
  const alice = await device.createProfile('Alice')
  const epub = await buildEpub({
    metadata: '<dc:title>Dune</dc:title><dc:creator>Frank Herbert</dc:creator>',
  })
  const upload = (name: string, data: Buffer) =>
    device
      .request({ method: 'POST', url: '/api/uploads', ...multipart(name, data) })
      .then((r) => r.json())
  const { bookId } = await upload('dune.epub', epub)
  await upload('dune.mobi', buildMobi({ fullName: 'Dune', exth: [[100, 'Frank Herbert']] }))
  const files = (await device.request({ url: `/api/books/${bookId}` })).json().files as {
    id: string
    format: string
  }[]
  const fileId = files.find((f) => f.format === 'epub')?.id as string
  const mobiId = files.find((f) => f.format === 'mobi')?.id as string
  return { device, alice, bookId: bookId as string, fileId, mobiId }
}

const highlight = (fileId: string, fields: Partial<Record<string, unknown>> = {}) => ({
  kind: 'highlight',
  id: 'highlight-0001',
  fileId,
  cfiRange: 'epubcfi(/6/4!/4/2,/1:0,/1:10)',
  colour: 'yellow',
  text: 'The spice must flow',
  note: null,
  deleted: false,
  hlc: at(0),
  ...fields,
})

async function sync(device: Device, profileId: string, changes: unknown[], cursor = 0) {
  return (
    await device.request({
      method: 'POST',
      url: '/api/sync',
      payload: { profileId, deviceId: 'phone', cursor, changes },
    })
  ).json()
}

const rows = (table: string) =>
  h.db.$client.prepare(`select * from ${table}`).all() as Record<string, unknown>[]

describe('Highlights and Bookmarks', () => {
  it('stores, edits and pulls a Highlight with its Note', async () => {
    const { device, alice, bookId, fileId } = await setup()
    await sync(device, alice.id, [highlight(fileId)])
    const res = await sync(device, alice.id, [
      highlight(fileId, { note: 'Key line', colour: 'pink', hlc: at(10) }),
    ])
    expect(res.records.find((r: { kind: string }) => r.kind === 'highlight')).toMatchObject({
      bookId,
      colour: 'pink',
      note: 'Key line',
    })
  })

  it('keeps a delete as a tombstone that an older offline edit cannot undo', async () => {
    const { device, alice, fileId } = await setup()
    await sync(device, alice.id, [highlight(fileId)])
    await sync(device, alice.id, [highlight(fileId, { deleted: true, hlc: at(20) })])
    const stale = await sync(device, alice.id, [
      highlight(fileId, { note: 'offline edit', hlc: at(10) }),
    ])
    expect(stale.applied).toBe(0)
    expect(rows('highlights')).toMatchObject([{ deleted: 1 }])
  })

  it('never lets one Profile overwrite another Profile’s record by id', async () => {
    const { device, alice, fileId } = await setup()
    const bob = await device.createProfile('Bob')
    await sync(device, alice.id, [highlight(fileId)])
    const res = await sync(device, bob.id, [highlight(fileId, { text: 'hijacked', hlc: at(50) })])
    expect(res.applied).toBe(0)
    expect(rows('highlights')).toMatchObject([
      { profile_id: alice.id, text: 'The spice must flow' },
    ])
  })

  it('stores Bookmarks with tombstones too', async () => {
    const { device, alice, fileId } = await setup()
    const bookmark = {
      kind: 'bookmark',
      id: 'bookmark-0001',
      fileId,
      cfi: 'epubcfi(/6/4!/4/2/1:0)',
      snippet: 'A beginning',
      deleted: false,
      hlc: at(0),
    }
    await sync(device, alice.id, [bookmark])
    const res = await sync(device, alice.id, [{ ...bookmark, deleted: true, hlc: at(5) }])
    expect(res.records.find((r: { kind: string }) => r.kind === 'bookmark')).toMatchObject({
      deleted: true,
    })
  })

  it('deletes everyone’s annotations on a File when it is removed', async () => {
    const { device, alice, fileId, mobiId } = await setup()
    await sync(device, alice.id, [highlight(mobiId)])
    expect(
      (await device.request({ method: 'DELETE', url: `/api/files/${mobiId}` })).statusCode,
    ).toBe(204)
    expect(rows('highlights')).toEqual([])
    void fileId
  })
})

describe('Markdown export', () => {
  it('lists live Highlights in reading order with Notes as blockquotes', async () => {
    const { device, alice, bookId, fileId } = await setup()
    await sync(device, alice.id, [
      highlight(fileId, {
        id: 'highlight-late',
        cfiRange: 'epubcfi(/6/8!/4/2,/1:0,/1:5)',
        text: 'Later line',
      }),
      highlight(fileId, {
        id: 'highlight-early',
        text: 'Earlier line',
        note: 'Why it matters\nsecond line',
      }),
      highlight(fileId, {
        id: 'highlight-gone',
        cfiRange: 'epubcfi(/6/6!/4/2,/1:0,/1:5)',
        text: 'Deleted',
        deleted: true,
      }),
    ])
    const res = await device.request({ url: `/api/books/${bookId}/highlights.md` })
    expect(res.headers['content-type']).toContain('text/markdown')
    expect(res.headers['content-disposition']).toContain('Dune%20-%20highlights.md')
    expect(res.body).toBe(
      '# Dune\n\nby Frank Herbert\n\nEarlier line\n\n> Why it matters\n> second line\n\n---\n\nLater line\n',
    )
  })

  it('heads each File separately when a Book has highlights in several', () => {
    const md = highlightsMarkdown(
      'T',
      [],
      [
        {
          fileId: 'a',
          format: 'epub',
          cfiRange: 'epubcfi(/6/2!/4,/1:0,/1:1)',
          text: 'one',
          note: null,
        },
        {
          fileId: 'b',
          format: 'mobi',
          cfiRange: 'epubcfi(/6/2!/4,/1:0,/1:1)',
          text: 'two',
          note: null,
        },
      ],
    )
    expect(md).toContain('## EPUB')
    expect(md).toContain('## MOBI')
  })

  it('says when there is nothing to export', () => {
    expect(highlightsMarkdown('T', [], [])).toBe('# T\n\n_No highlights yet._\n')
  })
})
