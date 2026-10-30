import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { PNG } from '../test/epub-fixture.ts'
import { buildMobi, type MobiFixture } from '../test/mobi-fixture.ts'
import { extractMobi } from './mobi.ts'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-mobi-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

function extractFrom(fixture: MobiFixture) {
  const file = path.join(tmp, `${Math.random()}.mobi`)
  fs.writeFileSync(file, buildMobi(fixture))
  return extractMobi(file)
}

const coverOffset = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

describe('extractMobi', () => {
  it('reads EXTH metadata', async () => {
    const { metadata } = await extractFrom({
      fullName: 'Dune',
      exth: [
        [100, 'Frank Herbert'],
        [100, 'Second Author'],
        [101, 'Ace'],
        [103, '&lt;p&gt;Spice &amp;amp; sand&lt;/p&gt;'],
        [104, '0-441-17271-7'],
        [105, 'Science Fiction'],
        [106, '1965-08-01'],
        [524, 'en'],
      ],
    })
    expect(metadata).toEqual({
      title: 'Dune',
      authors: ['Frank Herbert', 'Second Author'],
      publisher: 'Ace',
      description: 'Spice & sand',
      isbn: '9780441172719',
      tags: ['Science Fiction'],
      publishedDate: '1965-08-01',
      language: 'en',
    })
  })

  it('prefers the updated title and reads an ISBN from the Calibre source record', async () => {
    const { metadata } = await extractFrom({
      fullName: 'DUNE_FULLNAME',
      exth: [
        [503, 'Dune'],
        [112, 'urn:isbn:9780441172719'],
      ],
    })
    expect(metadata).toMatchObject({ title: 'Dune', isbn: '9780441172719' })
  })

  it('decodes CP1252 files', async () => {
    const { metadata } = await extractFrom({
      fullName: 'Les Misérables',
      utf8: false,
      exth: [[100, 'Victor Hugo']],
    })
    expect(metadata.title).toBe('Les Misérables')
  })

  it('finds the cover through EXTH 201', async () => {
    const { cover } = await extractFrom({
      fullName: 'T',
      exth: [[201, coverOffset(1)]],
      images: [Buffer.from('not an image'), PNG],
    })
    expect(cover).toEqual({ data: PNG, ext: 'png' })
  })

  it('has no cover when there are no image records', async () => {
    const { cover } = await extractFrom({ fullName: 'T', exth: [[201, coverOffset(0)]] })
    expect(cover).toBeUndefined()
  })

  it('rejects files that are not MOBI', async () => {
    const file = path.join(tmp, 'bad.mobi')
    fs.writeFileSync(file, Buffer.alloc(200))
    await expect(extractMobi(file)).rejects.toThrow('Not a MOBI file')
  })
})
