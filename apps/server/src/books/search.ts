import type { Db } from '../db/client.ts'
import type { ReadStatus } from '../sync/service.ts'
import { ADDED_SQL, HIDDEN_SQL, IN_LIBRARY_SQL, VISIBLE_SQL } from './visibility.ts'

export const BOOK_SORTS = ['added', 'title', 'author', 'series', 'recent', 'relevance'] as const
export type BookSort = (typeof BOOK_SORTS)[number]
export const BOOK_SCOPES = ['all', 'mine', 'shared'] as const
export type BookScope = (typeof BOOK_SCOPES)[number]

const HAS_AUDIO_SQL = "EXISTS (SELECT 1 FROM files f WHERE f.book_id = b.id AND f.format = 'audio')"

export interface BookFilters {
  q?: string | undefined
  status?: ReadStatus | undefined
  author?: string | undefined
  series?: string | undefined
  tag?: string | undefined
  /** Own Books, Books Shared with the Profile, or both (the default). */
  scope?: BookScope | undefined
  shelf?: string | undefined
  /** Only the Shared Books the Profile has hidden, instead of its library. */
  hidden?: boolean | undefined
  /** Only Books with an Audio File. */
  audio?: boolean | undefined
  /** Defaults to relevance with a query, series index within a series, else recently added. */
  sort?: BookSort | undefined
  offset?: number | undefined
  limit: number
}

export interface Facet {
  name: string
  count: number
}

/** First author's name, for sorting by author. */
const FIRST_AUTHOR = `(SELECT name FROM book_authors WHERE book_id = b.id ORDER BY position LIMIT 1)`
/** Newest Reading Progress on any of the Book's Files; HLCs sort by time as strings. */
const LAST_READ = `(SELECT max(p.hlc) FROM reading_progress p JOIN files f ON f.id = p.file_id
  WHERE f.book_id = b.id AND p.profile_id = @profileId)`

const ORDER: Record<BookSort, string> = {
  added: `${ADDED_SQL} DESC`,
  title: 'b.sort_title COLLATE NOCASE',
  author: `${FIRST_AUTHOR} IS NULL, ${FIRST_AUTHOR} COLLATE NOCASE, b.sort_title COLLATE NOCASE`,
  series:
    'b.series_name IS NULL, b.series_name COLLATE NOCASE, b.series_index IS NULL, b.series_index, b.sort_title COLLATE NOCASE',
  recent: `${LAST_READ} IS NULL, ${LAST_READ} DESC`,
  // Title matches count most, then authors and series, then tags, then the description.
  relevance: 'bm25(books_fts, 0, 10, 5, 4, 2, 1)',
}

/**
 * Turns what someone typed into an FTS5 query: every word must match, each as a prefix, and
 * nothing they type is read as FTS syntax.
 */
export function ftsQuery(input: string): string | undefined {
  const words = input
    .split(/\s+/)
    .map((w) => w.replaceAll('"', ''))
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : undefined
}

/** Library listing and facets, in SQL so search, filters and paging happen together (ticket 06). */
export class BookSearch {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  list(
    profileId: string,
    filters: BookFilters,
  ): { rows: { id: string; addedAt: number }[]; total: number } {
    const params: Record<string, unknown> = { profileId }
    const where = [filters.hidden ? `${VISIBLE_SQL} AND ${HIDDEN_SQL}` : IN_LIBRARY_SQL]
    if (filters.scope === 'mine') where.push('b.owner_profile_id = @profileId')
    if (filters.scope === 'shared') where.push('b.owner_profile_id <> @profileId')
    let from = 'books b'

    const match = filters.q ? ftsQuery(filters.q) : undefined
    if (filters.q && !match) return { rows: [], total: 0 }
    if (match) {
      from = 'books_fts JOIN books b ON b.id = books_fts.book_id'
      where.push('books_fts MATCH @match')
      params.match = match
    }
    if (filters.status) {
      where.push(`coalesce((SELECT status FROM read_status
        WHERE profile_id = @profileId AND book_id = b.id), 'unread') = @status`)
      params.status = filters.status
    }
    if (filters.author) {
      where.push('EXISTS (SELECT 1 FROM book_authors WHERE book_id = b.id AND name = @author)')
      params.author = filters.author
    }
    if (filters.series) {
      where.push('b.series_name = @series')
      params.series = filters.series
    }
    if (filters.audio) where.push(HAS_AUDIO_SQL)
    if (filters.shelf) {
      where.push(`EXISTS (SELECT 1 FROM shelf_books sb JOIN shelves sh ON sh.id = sb.shelf_id
        WHERE sb.book_id = b.id AND sh.id = @shelf AND sh.profile_id = @profileId)`)
      params.shelf = filters.shelf
    }
    if (filters.tag) {
      where.push('EXISTS (SELECT 1 FROM book_tags WHERE book_id = b.id AND tag = @tag)')
      params.tag = filters.tag
    }

    let sort = filters.sort ?? (match ? 'relevance' : filters.series ? 'series' : 'added')
    if (sort === 'relevance' && !match) sort = 'added'

    const sql = `FROM ${from} WHERE ${where.join(' AND ')}`
    const client = this.db.$client
    const { total } = client.prepare(`SELECT count(*) AS total ${sql}`).get(params) as {
      total: number
    }
    const rows = client
      .prepare(
        `SELECT b.id AS id, ${ADDED_SQL} AS addedAt ${sql}
         ORDER BY ${ORDER[sort]}, b.id LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: filters.limit, offset: filters.offset ?? 0 }) as {
      id: string
      addedAt: number
    }[]
    return { rows, total }
  }

  /**
   * Authors, series and tags across the Profile's library, with how many Books each has, and
   * how many Books are Shared with it or hidden, so the client offers those filters only then.
   */
  facets(profileId: string): {
    authors: Facet[]
    series: Facet[]
    tags: Facet[]
    shared: number
    hidden: number
    audio: number
  } {
    const client = this.db.$client
    const facet = (sql: string) =>
      client
        .prepare(`${sql} GROUP BY name ORDER BY name COLLATE NOCASE`)
        .all({ profileId }) as Facet[]
    const count = (where: string) =>
      (
        client.prepare(`SELECT count(*) AS n FROM books b WHERE ${where}`).get({ profileId }) as {
          n: number
        }
      ).n
    return {
      shared: count(`${IN_LIBRARY_SQL} AND b.owner_profile_id <> @profileId`),
      hidden: count(`${VISIBLE_SQL} AND ${HIDDEN_SQL}`),
      audio: count(`${IN_LIBRARY_SQL} AND ${HAS_AUDIO_SQL}`),
      authors: facet(`SELECT a.name AS name, count(DISTINCT b.id) AS count
        FROM book_authors a JOIN books b ON b.id = a.book_id WHERE ${IN_LIBRARY_SQL}`),
      series: facet(`SELECT b.series_name AS name, count(*) AS count
        FROM books b WHERE b.series_name IS NOT NULL AND ${IN_LIBRARY_SQL}`),
      tags: facet(`SELECT t.tag AS name, count(*) AS count
        FROM book_tags t JOIN books b ON b.id = t.book_id WHERE ${IN_LIBRARY_SQL}`),
    }
  }
}
