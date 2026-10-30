/** What an extractor can tell us about a File; every field is optional. */
export interface ExtractedMetadata {
  title?: string
  authors: string[]
  description?: string
  language?: string
  publisher?: string
  publishedDate?: string
  isbn?: string
  seriesName?: string
  seriesIndex?: number
  tags: string[]
}

export interface ExtractedCover {
  data: Buffer
  ext: 'jpg' | 'png' | 'gif' | 'webp'
}

export interface Extracted {
  metadata: ExtractedMetadata
  cover?: ExtractedCover
}

const COVER_TYPES: Record<string, ExtractedCover['ext']> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/** SVG covers are dropped: they can carry script and aren't worth sanitising. */
export function coverExtForMediaType(
  mediaType: string | undefined,
): ExtractedCover['ext'] | undefined {
  return mediaType ? COVER_TYPES[mediaType.toLowerCase()] : undefined
}

/** Lowercased, diacritics and punctuation folded: the key titles and authors are matched on. */
export function foldForMatching(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Matches a File to an existing Book of the same Profile (ticket 09). */
export function matchKey(title: string, firstAuthor: string | undefined): string {
  return `${foldForMatching(title)}|${foldForMatching(firstAuthor ?? '')}`
}

export function sortTitle(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '').trim()
}

/** Returns an ISBN-13 for any valid ISBN-10/13 spelling, else undefined. */
export function normaliseIsbn(raw: string): string | undefined {
  const value = raw
    .replace(/^(urn:)?isbn:?/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase()
  if (/^\d{13}$/.test(value)) return isbn13Valid(value) ? value : undefined
  if (/^\d{9}[\dX]$/.test(value)) {
    if (!isbn10Valid(value)) return undefined
    const core = `978${value.slice(0, 9)}`
    return core + isbn13CheckDigit(core)
  }
  return undefined
}

function isbn10Valid(v: string): boolean {
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const c = v[i] as string
    sum += (c === 'X' ? 10 : Number(c)) * (10 - i)
  }
  return sum % 11 === 0
}

function isbn13CheckDigit(first12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return String((10 - (sum % 10)) % 10)
}

function isbn13Valid(v: string): boolean {
  return isbn13CheckDigit(v.slice(0, 12)) === v[12]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Descriptions are often HTML; Papyrus stores plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*\/(p|div|h\d)\s*>/gi, '\n\n')
    .replace(/<\s*(br|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#')
        return String.fromCodePoint(
          e[1]?.toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

/** Strips the extension and the usual separators: "Frank_Herbert-Dune.epub" → "Frank Herbert Dune". */
export function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  return base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || name
}
