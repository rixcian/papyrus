import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEpub, PNG } from '../test/epub-fixture.ts'
import { extractEpub } from './epub.ts'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-epub-'))
afterEach(() => {
  for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f))
})

async function extractFrom(fixture: Parameters<typeof buildEpub>[0]) {
  const file = path.join(tmp, `${Math.random()}.epub`)
  fs.writeFileSync(file, await buildEpub(fixture))
  return extractEpub(file)
}

describe('extractEpub', () => {
  it('reads EPUB 3 metadata, roles and a series collection', async () => {
    const { metadata } = await extractFrom({
      metadata: `
        <dc:identifier id="uid">urn:isbn:9780441172719</dc:identifier>
        <dc:title id="t1">Dune</dc:title>
        <dc:creator id="c1">Frank Herbert</dc:creator>
        <meta refines="#c1" property="role">aut</meta>
        <dc:creator id="c2">Some Illustrator</dc:creator>
        <meta refines="#c2" property="role">ill</meta>
        <dc:language>en</dc:language>
        <dc:publisher>Ace</dc:publisher>
        <dc:date>1965-08-01</dc:date>
        <dc:subject>Science Fiction</dc:subject>
        <dc:description>&lt;p&gt;Spice &amp;amp; sand&lt;/p&gt;</dc:description>
        <meta property="belongs-to-collection" id="s1">Dune Chronicles</meta>
        <meta refines="#s1" property="collection-type">series</meta>
        <meta refines="#s1" property="group-position">1</meta>`,
    })
    expect(metadata).toEqual({
      title: 'Dune',
      authors: ['Frank Herbert'],
      isbn: '9780441172719',
      language: 'en',
      publisher: 'Ace',
      publishedDate: '1965-08-01',
      tags: ['Science Fiction'],
      description: 'Spice & sand',
      seriesName: 'Dune Chronicles',
      seriesIndex: 1,
    })
  })

  it('falls back to Calibre series metas and EPUB 2 roles', async () => {
    const { metadata } = await extractFrom({
      metadata: `
        <dc:title>Dune Messiah</dc:title>
        <dc:creator opf:role="aut" opf:file-as="Herbert, Frank">Frank Herbert</dc:creator>
        <dc:identifier opf:scheme="ISBN">0-441-17271-7</dc:identifier>
        <meta name="calibre:series" content="Dune"/>
        <meta name="calibre:series_index" content="2.5"/>`,
    })
    expect(metadata).toMatchObject({
      authors: ['Frank Herbert'],
      isbn: '9780441172719',
      seriesName: 'Dune',
      seriesIndex: 2.5,
    })
  })

  it('finds the cover through the cover-image property', async () => {
    const { cover } = await extractFrom({
      metadata: '<dc:title>T</dc:title>',
      manifest:
        '<item id="img" href="images/front%20cover.png" media-type="image/png" properties="cover-image"/>',
      files: { 'OEBPS/images/front cover.png': PNG },
    })
    expect(cover).toEqual({ data: PNG, ext: 'png' })
  })

  it('finds the cover through an EPUB 2 cover meta', async () => {
    const { cover } = await extractFrom({
      metadata: '<dc:title>T</dc:title><meta name="cover" content="c"/>',
      manifest: '<item id="c" href="c.jpg" media-type="image/jpeg"/>',
      files: { 'OEBPS/c.jpg': PNG },
    })
    expect(cover?.ext).toBe('jpg')
  })

  it('ignores SVG covers', async () => {
    const { cover } = await extractFrom({
      metadata: '<dc:title>T</dc:title>',
      manifest:
        '<item id="img" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>',
      files: { 'OEBPS/cover.svg': '<svg/>' },
    })
    expect(cover).toBeUndefined()
  })

  it('rejects a zip that is not an epub', async () => {
    const file = path.join(tmp, 'bad.epub')
    fs.writeFileSync(file, 'not a zip')
    await expect(extractEpub(file)).rejects.toThrow()
  })
})
