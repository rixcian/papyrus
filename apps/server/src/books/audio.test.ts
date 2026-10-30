import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AUDIO_DIR, audioFixture, multipartMany, QUIET_SHORE } from '../test/audio-fixture.ts'
import { buildEpub, multipart } from '../test/epub-fixture.ts'
import { createHarness, Device, type Harness } from '../test/harness.ts'
import { chaptersFor, groupTracks, orderTracks, probeAudio } from './audio.ts'

let h: Harness
afterEach(() => h?.close())

async function setup() {
  h = await createHarness()
  const device = new Device(h.app)
  await device.createProfile('Alice')
  return device
}

const uploadAudio = (device: Device, names: string[], rename?: (n: string) => string) =>
  device.request({
    method: 'POST',
    url: '/api/uploads/audio',
    ...multipartMany(names.map((n) => ({ filename: rename?.(n) ?? n, data: audioFixture(n) }))),
  })

const detail = async (device: Device, id: string) =>
  (await device.request({ url: `/api/books/${id}` })).json()

const blobCount = () => {
  const dir = path.join(h.dataDir, 'blobs')
  return fs.readdirSync(dir).flatMap((d) => fs.readdirSync(path.join(dir, d))).length
}

describe('probing recordings', () => {
  it('reads tags, duration, the cover and embedded chapters', async () => {
    const first = await probeAudio(path.join(AUDIO_DIR, '01-arrival.mp3'), '01-arrival.mp3')
    expect(first).toMatchObject({
      container: 'mp3',
      mime: 'audio/mpeg',
      title: 'Arrival',
      album: 'The Quiet Shore',
      author: 'Ada Lindqvist',
      year: '2019',
      genres: ['Fiction'],
      track: 1,
    })
    expect(first.duration).toBeCloseTo(4, 0)
    expect(first.cover?.ext).toBe('png')

    const m4b = await probeAudio(path.join(AUDIO_DIR, 'northern-lights.m4b'), 'n.m4b')
    expect(m4b.mime).toBe('audio/mp4')
    expect(m4b.chapters.map((c) => [c.title, Math.round(c.start)])).toEqual([
      ['Opening', 0],
      ['Middle', 3],
      ['Closing', 6],
    ])
  })

  it('orders by disc, track number, then name with numbers as numbers', () => {
    const t = (originalName: string, track?: number, disc?: number) => ({
      originalName,
      track,
      disc,
    })
    expect(
      orderTracks([t('b', 2, 2), t('a', 1, 2), t('z', 9, 1)]).map((x) => x.originalName),
    ).toEqual(['z', 'a', 'b'])
    expect(
      orderTracks([t('Part 10.mp3'), t('Part 2.mp3'), t('Part 1.mp3')]).map((x) => x.originalName),
    ).toEqual(['Part 1.mp3', 'Part 2.mp3', 'Part 10.mp3'])
  })

  it('groups by album, with untagged recordings together', () => {
    const t = (originalName: string, album?: string) => ({
      originalName,
      album,
      disc: undefined,
      track: undefined,
    })
    const groups = groupTracks([t('1', 'Dune'), t('2'), t('3', 'DUNE'), t('4', 'Emma'), t('5')])
    expect(groups.map((g) => g.map((x) => x.originalName))).toEqual([['1', '3'], ['2', '5'], ['4']])
  })

  it('makes one Chapter per Track only when there are several Tracks', () => {
    const t = (title: string, duration: number) =>
      ({ title, duration, chapters: [], originalName: `${title}.mp3` }) as never
    expect(chaptersFor([t('One', 10), t('Two', 5)])).toEqual([
      { title: 'One', start: 0 },
      { title: 'Two', start: 10 },
    ])
    expect(chaptersFor([t('Only', 10)])).toEqual([])
  })
})

describe('uploading audio', () => {
  it('makes one Audio File of Tracks sent out of order, with chapters and a cover', async () => {
    const device = await setup()
    const res = await uploadAudio(device, [...QUIET_SHORE].reverse())
    expect(res.statusCode).toBe(200)
    const [result] = res.json().results
    expect(result).toMatchObject({ status: 'created', title: 'The Quiet Shore' })

    const book = await detail(device, result.bookId)
    expect(book).toMatchObject({
      authors: ['Ada Lindqvist'],
      publishedDate: '2019',
      tags: ['Fiction'],
      formats: ['audio'],
    })
    expect(book.coverUrl).toBeTruthy()
    expect(book.files).toHaveLength(1)
    const [file] = book.files
    expect(file).toMatchObject({ kind: 'audio', readable: false, trackCount: 3, format: 'audio' })
    expect(file.duration).toBeCloseTo(12.2, 0)
    expect(file.size).toBe(QUIET_SHORE.reduce((n, f) => n + audioFixture(f).length, 0))

    const tracks = h.db.$client
      .prepare('select original_name from file_tracks where file_id = ? order by position')
      .all(file.id)
    expect(tracks).toEqual(QUIET_SHORE.map((original_name) => ({ original_name })))
    const chapters = h.db.$client
      .prepare('select title from file_chapters where file_id = ? order by position')
      .all(file.id)
    expect(chapters).toEqual([
      { title: 'Arrival' },
      { title: 'The Lighthouse' },
      { title: 'Departure' },
    ])
  })

  it('reports the same Tracks again as already in the library', async () => {
    const device = await setup()
    await uploadAudio(device, QUIET_SHORE)
    const again = await uploadAudio(device, QUIET_SHORE)
    expect(again.json().results[0]).toMatchObject({ status: 'duplicate' })
    expect(blobCount()).toBe(3)
  })

  it('makes separate Audio Files for separate albums in one request', async () => {
    const device = await setup()
    const res = await uploadAudio(device, [...QUIET_SHORE, 'northern-lights.m4b'])
    const titles = res.json().results.map((r: { title: string }) => r.title)
    expect(titles.sort()).toEqual(['Northern Lights', 'The Quiet Shore'])
  })

  it('attaches audio to the matching ebook Book', async () => {
    const device = await setup()
    const epub = (
      await device.request({
        method: 'POST',
        url: '/api/uploads',
        ...multipart(
          'shore.epub',
          await buildEpub({
            metadata: '<dc:title>The Quiet Shore</dc:title><dc:creator>Ada Lindqvist</dc:creator>',
          }),
        ),
      })
    ).json()
    const [result] = (await uploadAudio(device, QUIET_SHORE)).json().results
    expect(result).toMatchObject({ status: 'attached', bookId: epub.bookId })
    const book = await detail(device, epub.bookId)
    expect(book.files.map((f: { kind: string }) => f.kind).sort()).toEqual(['audio', 'text'])
  })

  it('takes a single recording through the ordinary upload too', async () => {
    const device = await setup()
    const res = await device.request({
      method: 'POST',
      url: '/api/uploads',
      ...multipart('untagged-recording.mp3', audioFixture('untagged-recording.mp3')),
    })
    expect(res.json()).toMatchObject({ status: 'created', title: 'untagged-recording' })
    const book = await detail(device, res.json().bookId)
    expect(book.files[0]).toMatchObject({ kind: 'audio', trackCount: 1 })
  })

  it('refuses files that are not audio and keeps nothing', async () => {
    const device = await setup()
    const res = await device.request({
      method: 'POST',
      url: '/api/uploads/audio',
      ...multipartMany([
        { filename: '01-arrival.mp3', data: audioFixture('01-arrival.mp3') },
        { filename: 'notes.txt', data: Buffer.from('hi') },
      ]),
    })
    expect(res.statusCode).toBe(400)
    expect(blobCount()).toBe(0)
  })

  it('reports a recording that cannot be read', async () => {
    const device = await setup()
    const res = await device.request({
      method: 'POST',
      url: '/api/uploads/audio',
      ...multipartMany([{ filename: 'broken.m4b', data: Buffer.from('not audio at all') }]),
    })
    expect(res.json().results).toEqual([
      expect.objectContaining({ status: 'failed', message: expect.stringContaining('broken.m4b') }),
    ])
  })

  it('deletes Track blobs with the Book, but not ones another Profile still uses', async () => {
    const alice = await setup()
    const [mine] = (await uploadAudio(alice, QUIET_SHORE)).json().results
    const bob = new Device(h.app)
    await bob.createProfile('Bob')
    await uploadAudio(bob, QUIET_SHORE.slice(0, 2))
    expect(blobCount()).toBe(3)

    await alice.request({ method: 'DELETE', url: `/api/books/${mine.bookId}` })
    expect(blobCount()).toBe(2)
  })

  it('splits an Audio File off into its own Book with its own metadata', async () => {
    const device = await setup()
    const epub = (
      await device.request({
        method: 'POST',
        url: '/api/uploads',
        ...multipart(
          'shore.epub',
          await buildEpub({
            metadata: '<dc:title>The Quiet Shore</dc:title><dc:creator>Ada Lindqvist</dc:creator>',
          }),
        ),
      })
    ).json()
    await uploadAudio(device, QUIET_SHORE)
    const audio = (await detail(device, epub.bookId)).files.find(
      (f: { kind: string }) => f.kind === 'audio',
    )
    const res = await device.request({ method: 'POST', url: `/api/files/${audio.id}/split` })
    expect(res.statusCode).toBe(200)
    const split = await detail(device, res.json().id)
    expect(split).toMatchObject({ title: 'The Quiet Shore', formats: ['audio'] })
    expect(split.files[0]).toMatchObject({ id: audio.id, trackCount: 3 })
  })
})
