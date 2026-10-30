import path from 'node:path/posix'
import { XMLParser } from 'fast-xml-parser'
import yauzl from 'yauzl'
import {
  coverExtForMediaType,
  type Extracted,
  type ExtractedMetadata,
  htmlToText,
  normaliseIsbn,
} from './metadata.ts'

const MAX_XML_BYTES = 4 * 1024 * 1024
const MAX_COVER_BYTES = 15 * 1024 * 1024

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) =>
    [
      'title',
      'creator',
      'subject',
      'identifier',
      'date',
      'meta',
      'item',
      'reference',
      'rootfile',
      'language',
      'publisher',
      'description',
    ].includes(name),
})

type Node = Record<string, unknown>

const text = (node: unknown): string | undefined => {
  if (node == null) return undefined
  if (typeof node === 'string') return node.trim() || undefined
  if (typeof node === 'number') return String(node)
  const t = (node as Node)['#text']
  return typeof t === 'string'
    ? t.trim() || undefined
    : typeof t === 'number'
      ? String(t)
      : undefined
}
const attr = (node: unknown, name: string): string | undefined => {
  if (node == null || typeof node !== 'object') return undefined
  const v = (node as Node)[`@_${name}`]
  return typeof v === 'string' ? v : undefined
}
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value]

class ZipReader {
  private readonly entries = new Map<string, yauzl.Entry>()
  private readonly zip: yauzl.ZipFile

  private constructor(zip: yauzl.ZipFile) {
    this.zip = zip
  }

  static async open(file: string): Promise<ZipReader> {
    const zip = await yauzl.openPromise(file, { lazyEntries: true, autoClose: false })
    const reader = new ZipReader(zip)
    await new Promise<void>((resolve, reject) => {
      zip.on('entry', (entry: yauzl.Entry) => {
        reader.entries.set(entry.fileName, entry)
        zip.readEntry()
      })
      zip.on('end', () => resolve())
      zip.on('error', reject)
      zip.readEntry()
    })
    return reader
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  async read(name: string, maxBytes: number): Promise<Buffer> {
    const entry = this.entries.get(name)
    if (!entry) throw new Error(`Missing ${name} in the epub`)
    if (entry.uncompressedSize > maxBytes) throw new Error(`${name} is too large`)
    const stream = await this.zip.openReadStreamPromise(entry)
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks)
  }

  close(): void {
    this.zip.close()
  }
}

/** Reads metadata and the cover from an epub's OPF (ticket 03). */
export async function extractEpub(file: string): Promise<Extracted> {
  const zip = await ZipReader.open(file)
  try {
    const container = parser.parse(await zip.read('META-INF/container.xml', MAX_XML_BYTES)) as Node
    const rootfiles = list(((container.container as Node)?.rootfiles as Node)?.rootfile)
    const opfPath = rootfiles.map((r) => attr(r, 'full-path')).find((p) => p && zip.has(p))
    if (!opfPath) throw new Error('The epub has no package document')

    const opf = parser.parse(await zip.read(opfPath, MAX_XML_BYTES)) as Node
    const pkg = opf.package as Node | undefined
    if (!pkg) throw new Error('The package document is not valid')
    const meta = (pkg.metadata ?? {}) as Node
    const manifest = list((pkg.manifest as Node)?.item)
    const metas = list(meta.meta)
    const opfDir = path.dirname(opfPath)

    const metadata = readMetadata(meta, metas)
    const coverHref = findCoverHref(manifest, metas, list((pkg.guide as Node)?.reference))
    const extracted: Extracted = { metadata }
    if (coverHref) {
      const entryName = path.normalize(path.join(opfDir, decodeURIComponent(coverHref.href)))
      const ext = coverExtForMediaType(coverHref.mediaType)
      if (ext && zip.has(entryName))
        extracted.cover = { data: await zip.read(entryName, MAX_COVER_BYTES), ext }
    }
    return extracted
  } finally {
    zip.close()
  }
}

/**
 * Metadata from a standalone OPF, such as the `metadata.opf` Calibre writes next to each
 * book (ticket 09).
 */
export function opfMetadata(xml: Buffer | string): ExtractedMetadata {
  const opf = parser.parse(xml) as Node
  const meta = ((opf.package as Node | undefined)?.metadata ?? {}) as Node
  return readMetadata(meta, list(meta.meta))
}

/** EPUB 3 `refines` metas, keyed by the id they refine. */
function refinements(metas: unknown[]): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>()
  for (const m of metas) {
    const refines = attr(m, 'refines')?.replace(/^#/, '')
    const property = attr(m, 'property')
    const value = text(m)
    if (!refines || !property || value === undefined) continue
    if (!out.has(refines)) out.set(refines, new Map())
    out.get(refines)?.set(property, value)
  }
  return out
}

function readMetadata(meta: Node, metas: unknown[]): ExtractedMetadata {
  const refined = refinements(metas)
  const ref = (node: unknown, property: string) => {
    const id = attr(node, 'id')
    return id ? refined.get(id)?.get(property) : undefined
  }

  const titles = list(meta.title)
  const title = text(titles.find((t) => ref(t, 'title-type') === 'main') ?? titles[0])

  const creators = list(meta.creator).map((c) => ({
    name: text(c),
    role: attr(c, 'role') ?? ref(c, 'role'),
  }))
  const authorish = creators.filter((c) => c.name && (!c.role || c.role === 'aut'))
  const authors = (authorish.length ? authorish : creators).flatMap((c) => (c.name ? [c.name] : []))

  const identifiers = list(meta.identifier)
  const isbnNode =
    identifiers.find((i) => attr(i, 'scheme')?.toUpperCase() === 'ISBN') ??
    identifiers.find((i) => /isbn/i.test(text(i) ?? ''))
  const isbn: string | undefined =
    (isbnNode ? normaliseIsbn(text(isbnNode) ?? '') : undefined) ??
    identifiers.map((i) => normaliseIsbn(text(i) ?? '')).find((v) => v !== undefined)

  const description = text(list(meta.description)[0])
  const named = (name: string) =>
    attr(
      metas.find((m) => attr(m, 'name') === name),
      'content',
    )

  const metadata: ExtractedMetadata = {
    authors,
    tags: [...new Set(list(meta.subject).flatMap((s) => (text(s) ? [text(s) as string] : [])))],
  }
  if (title) metadata.title = title
  if (description) metadata.description = htmlToText(description)
  const language = text(list(meta.language)[0])
  if (language) metadata.language = language
  const publisher = text(list(meta.publisher)[0])
  if (publisher) metadata.publisher = publisher
  const date = text(list(meta.date)[0])
  if (date) metadata.publishedDate = date
  if (isbn) metadata.isbn = isbn

  // Series: EPUB 3 collections first, then Calibre's EPUB 2 metas (ticket 03).
  const collection = metas.find((m) => {
    if (attr(m, 'property') !== 'belongs-to-collection') return false
    const type = ref(m, 'collection-type')
    return type === undefined || type === 'series'
  })
  const seriesName = collection ? text(collection) : named('calibre:series')
  const rawIndex = collection ? ref(collection, 'group-position') : named('calibre:series_index')
  if (seriesName) {
    metadata.seriesName = seriesName
    const index = rawIndex === undefined ? Number.NaN : Number.parseFloat(rawIndex)
    if (Number.isFinite(index)) metadata.seriesIndex = index
  }
  return metadata
}

function findCoverHref(
  manifest: unknown[],
  metas: unknown[],
  guide: unknown[],
): { href: string; mediaType: string | undefined } | undefined {
  const asCover = (item: unknown) => {
    const href = attr(item, 'href')
    return href ? { href, mediaType: attr(item, 'media-type') } : undefined
  }
  const byProperty = manifest.find((i) =>
    attr(i, 'properties')?.split(/\s+/).includes('cover-image'),
  )
  if (byProperty) return asCover(byProperty)

  const coverId = attr(
    metas.find((m) => attr(m, 'name') === 'cover'),
    'content',
  )
  const byMeta = coverId && manifest.find((i) => attr(i, 'id') === coverId)
  if (byMeta) return asCover(byMeta)

  const guideHref = attr(
    guide.find((r) => attr(r, 'type') === 'cover'),
    'href',
  )?.split('#')[0]
  const byGuide = guideHref && manifest.find((i) => attr(i, 'href') === guideHref)
  if (byGuide && attr(byGuide, 'media-type')?.startsWith('image/')) return asCover(byGuide)

  const byName = manifest.find(
    (i) =>
      attr(i, 'media-type')?.startsWith('image/') &&
      /cover/i.test(`${attr(i, 'id') ?? ''} ${attr(i, 'href') ?? ''}`),
  )
  return byName ? asCover(byName) : undefined
}
