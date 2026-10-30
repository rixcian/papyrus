import { normaliseIsbn } from '../books/metadata.ts'

/** One possible match, already in Papyrus's own field shapes (ticket 09: Find online). */
export interface Candidate {
  /** The Open Library work, e.g. `/works/OL893414W`. */
  key: string
  title: string
  authors: string[]
  description: string | null
  publisher: string | null
  publishedDate: string | null
  isbn: string | null
  language: string | null
  tags: string[]
  coverId: number | null
}

export interface LookupQuery {
  isbn?: string | undefined
  title?: string | undefined
  author?: string | undefined
}

export class LookupError extends Error {}

type Json = Record<string, unknown>

const SEARCH_FIELDS =
  'key,title,author_name,first_publish_year,publisher,isbn,cover_i,language,subject'
const MAX_CANDIDATES = 6
const MAX_TAGS = 8
const TIMEOUT_MS = 8000
/** Open Library asks API clients to say who they are. */
const USER_AGENT = 'Papyrus (self-hosted ebook library)'

/** Open Library uses MARC codes; books store the usual two-letter codes where there is one. */
const LANGUAGES: Record<string, string> = {
  eng: 'en',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  dut: 'nl',
  nld: 'nl',
  cze: 'cs',
  ces: 'cs',
  slo: 'sk',
  slk: 'sk',
  pol: 'pl',
  rus: 'ru',
  ukr: 'uk',
  swe: 'sv',
  dan: 'da',
  nor: 'no',
  fin: 'fi',
  hun: 'hu',
  jpn: 'ja',
  chi: 'zh',
  zho: 'zh',
  kor: 'ko',
  gre: 'el',
  ell: 'el',
  tur: 'tr',
  ara: 'ar',
  heb: 'he',
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap((x) => (typeof x === 'string' && x.trim() ? [x.trim()] : [])) : []
/**
 * A search result is a work with all its editions merged, so a list of publishers or
 * languages belongs to many editions. Only an unambiguous value is worth offering.
 */
const only = (values: string[]): string | null =>
  new Set(values).size === 1 ? (values[0] ?? null) : null
const language = (code: string | null) => (code ? (LANGUAGES[code] ?? code) : null)
/** Descriptions come as a string or as `{ type, value }`. */
const text = (v: unknown): string | null =>
  str(v) ?? (v && typeof v === 'object' ? str((v as Json).value) : null)

/**
 * Open Library through the server (ticket 09): `/search.json` by ISBN or title and author,
 * the edition for an ISBN, and `/works/<key>.json` for descriptions. Covers come from
 * covers.openlibrary.org by numeric id only, so nothing else can be fetched through here.
 */
export class OpenLibrary {
  private readonly fetchImpl: typeof fetch
  private readonly base: string
  private readonly covers: string

  constructor(
    fetchImpl: typeof fetch = (...args) => fetch(...args),
    base = 'https://openlibrary.org',
    covers = 'https://covers.openlibrary.org',
  ) {
    this.fetchImpl = fetchImpl
    this.base = base
    this.covers = covers
  }

  async lookup(query: LookupQuery): Promise<Candidate[]> {
    const isbn = query.isbn ? normaliseIsbn(query.isbn) : undefined
    if (isbn) {
      const found = await this.byIsbn(isbn)
      if (found) return [found]
    }
    const title = query.title?.trim()
    if (!title) return []
    const params = new URLSearchParams({
      title,
      fields: SEARCH_FIELDS,
      limit: String(MAX_CANDIDATES),
    })
    if (query.author?.trim()) params.set('author', query.author.trim())
    const docs = ((await this.get(`/search.json?${params}`))?.docs ?? []) as Json[]
    return Promise.all(docs.map((doc) => this.fromSearch(doc)))
  }

  /** A cover image, by Open Library's numeric id. */
  async cover(
    coverId: number,
    size: 'S' | 'M' | 'L',
  ): Promise<{ data: Buffer; contentType: string }> {
    const res = await this.request(`${this.covers}/b/id/${coverId}-${size}.jpg?default=false`)
    if (!res.ok) throw new LookupError(`Open Library has no cover ${coverId}`)
    return {
      data: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'image/jpeg',
    }
  }

  private async byIsbn(isbn: string): Promise<Candidate | undefined> {
    const [edition, search] = await Promise.all([
      this.get(`/isbn/${isbn}.json`),
      this.get(`/search.json?${new URLSearchParams({ isbn, fields: SEARCH_FIELDS, limit: '1' })}`),
    ])
    const doc = ((search?.docs ?? []) as Json[])[0]
    if (!edition && !doc) return undefined
    const fromDoc = doc ? await this.fromSearch(doc) : undefined
    const workKey = str(((edition?.works ?? []) as Json[])[0]?.key) ?? fromDoc?.key ?? ''
    const description =
      text(edition?.description) ??
      fromDoc?.description ??
      (workKey ? await this.description(workKey) : null)
    const editionLanguage = str(((edition?.languages ?? []) as Json[])[0]?.key)
      ?.split('/')
      .pop()
    const covers = (edition?.covers ?? []) as unknown[]
    return {
      key: workKey,
      title: str(edition?.title) ?? fromDoc?.title ?? '',
      authors: fromDoc?.authors ?? [],
      description,
      publisher: strings(edition?.publishers)[0] ?? fromDoc?.publisher ?? null,
      publishedDate: str(edition?.publish_date) ?? fromDoc?.publishedDate ?? null,
      isbn,
      language: language(editionLanguage ?? null) ?? fromDoc?.language ?? null,
      tags: fromDoc?.tags ?? [],
      coverId:
        (typeof covers[0] === 'number' && covers[0] > 0 ? covers[0] : null) ??
        fromDoc?.coverId ??
        null,
    }
  }

  private async fromSearch(doc: Json): Promise<Candidate> {
    const key = str(doc.key) ?? ''
    const isbns = strings(doc.isbn)
    const year = doc.first_publish_year
    return {
      key,
      title: str(doc.title) ?? '',
      authors: strings(doc.author_name),
      description: key ? await this.description(key) : null,
      publisher: only(strings(doc.publisher)),
      publishedDate: typeof year === 'number' ? String(year) : null,
      // Every edition's ISBNs; only a single edition's pair (ISBN-10 and -13) names one book.
      isbn: isbns.length <= 2 ? (isbns.find((i) => i.length === 13) ?? isbns[0] ?? null) : null,
      language: language(only(strings(doc.language))),
      tags: strings(doc.subject).slice(0, MAX_TAGS),
      coverId: typeof doc.cover_i === 'number' && doc.cover_i > 0 ? doc.cover_i : null,
    }
  }

  /** Best effort: a candidate without a description is still useful. */
  private async description(workKey: string): Promise<string | null> {
    try {
      let work = await this.get(`${workKey}.json`)
      // Merged works answer with a redirect record pointing at the surviving work.
      const redirect = str(work?.location)
      if (redirect && str((work?.type as Json | undefined)?.key) === '/type/redirect')
        work = await this.get(`${redirect}.json`)
      return text(work?.description)
    } catch {
      return null
    }
  }

  private async get(pathAndQuery: string): Promise<Json | undefined> {
    const res = await this.request(`${this.base}${pathAndQuery}`)
    if (res.status === 404) return undefined
    if (!res.ok) throw new LookupError(`Open Library answered ${res.status}`)
    return (await res.json()) as Json
  }

  private async request(url: string): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'follow',
      })
    } catch (error) {
      throw new LookupError(`Couldn’t reach Open Library: ${(error as Error).message}`)
    }
  }
}
