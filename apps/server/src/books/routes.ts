import path from 'node:path'
import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { eq, inArray } from 'drizzle-orm'
import type { FastifyReply } from 'fastify'
import { ZipFile } from 'yazl'
import { z } from 'zod'
import type { Db } from '../db/client.ts'
import {
  type BookRow,
  bookAuthors,
  books,
  bookTags,
  type FileTrackRow,
  profiles,
} from '../db/schema.ts'
import { AppError, notFound } from '../errors.ts'
import { requireProfile } from '../session.ts'
import type { ShelfService } from '../shelves/service.ts'
import { READ_STATUSES, type SyncService } from '../sync/service.ts'
import { groupTracks, isAudioName } from './audio.ts'
import type { BlobStore } from './blobs.ts'
import { FILE_FORMATS, type FileFormat, READABLE_FORMATS } from './formats.ts'
import type { Ingest, StagedTrack } from './ingest.ts'
import { type Library, SHARE_MODES } from './library.ts'
import { matchKey, normaliseIsbn, sortTitle } from './metadata.ts'
import type { Reshape } from './reshape.ts'
import { BOOK_SCOPES, BOOK_SORTS, BookSearch } from './search.ts'

const ErrorBody = z.object({ error: z.string(), message: z.string() })
const Format = z.enum(FILE_FORMATS)
const BookParams = z.object({ bookId: z.string() })
const FileParams = z.object({ fileId: z.string() })

const BookSummary = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  seriesName: z.string().nullable(),
  seriesIndex: z.number().nullable(),
  coverUrl: z.string().nullable(),
  formats: z.array(Format),
  owned: z.boolean(),
  /** The Owning Profile's name, for a Book Shared with this Profile; null for its own. */
  sharedBy: z.string().nullable(),
  /** When it was added, or for a Shared Book, when it was Shared with this Profile. */
  addedAt: z.number(),
  readStatus: z.enum(READ_STATUSES),
  /** The File read most recently and how far into it, for resuming and "Continue reading". */
  lastRead: z
    .object({
      fileId: z.string(),
      fraction: z.number(),
      at: z.number(),
      /** Whether that File is read or listened to; audio carries its length in seconds. */
      kind: z.enum(['text', 'audio']),
      duration: z.number().nullable(),
    })
    .nullable(),
})

const ShareBody = z.object({
  mode: z.enum(SHARE_MODES),
  profiles: z.array(z.object({ id: z.string(), name: z.string() })),
})

const Facet = z.object({ name: z.string(), count: z.number() })

const BookFile = z.object({
  id: z.string(),
  format: Format,
  originalName: z.string(),
  size: z.number(),
  readable: z.boolean(),
  /** Text is read, audio is listened to. */
  kind: z.enum(['text', 'audio']),
  /** Seconds, for an Audio File. */
  duration: z.number().nullable(),
  /** How many recordings an Audio File is made of; 0 for text. */
  trackCount: z.number(),
  url: z.string(),
  addedAt: z.number(),
})

const BookDetail = BookSummary.omit({ formats: true }).extend({
  formats: z.array(Format),
  description: z.string().nullable(),
  language: z.string().nullable(),
  publisher: z.string().nullable(),
  publishedDate: z.string().nullable(),
  isbn: z.string().nullable(),
  tags: z.array(z.string()),
  ownerName: z.string(),
  hidden: z.boolean(),
  /** Who the Book is Shared with; only the Owning Profile sees this (ticket 06). */
  share: ShareBody.nullable(),
  /** This Profile's shelves holding the Book. */
  shelves: z.array(z.object({ id: z.string(), name: z.string() })),
  files: z.array(BookFile),
  updatedAt: z.number(),
})

/** Blank strings clear a field; `undefined` leaves it alone. */
const OptionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v?.trim() || null))

const BookPatch = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  authors: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  description: OptionalText(20_000),
  language: OptionalText(35),
  publisher: OptionalText(200),
  publishedDate: OptionalText(40),
  isbn: OptionalText(40),
  seriesName: OptionalText(300),
  seriesIndex: z.number().finite().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
})

const IngestResultBody = z.object({
  status: z.enum(['created', 'attached', 'duplicate', 'failed']),
  bookId: z.string().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
})

const CONTENT_TYPES: Record<FileFormat, string> = {
  epub: 'application/epub+zip',
  mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/vnd.amazon.ebook',
  pdf: 'application/pdf',
  cbz: 'application/vnd.comicbook+zip',
  audio: 'audio/mpeg',
  other: 'application/octet-stream',
}

export interface BookRouteDeps {
  db: Db
  blobs: BlobStore
  ingest: Ingest
  library: Library
  sync: SyncService
  shelves: ShelfService
  reshape: Reshape
  maxUploadBytes: number
}

export function bookRoutes({
  db,
  blobs,
  ingest,
  library,
  sync,
  shelves,
  reshape,
  maxUploadBytes,
}: BookRouteDeps): FastifyPluginAsyncZod {
  const search = new BookSearch(db)
  const coverUrl = (b: BookRow) => (b.coverExt ? `/api/books/${b.id}/cover?v=${b.updatedAt}` : null)

  function readingState(profileId: string, bookIds: string[]) {
    const statuses = sync.statusFor(profileId, bookIds)
    const latest = sync.latestProgress(profileId, bookIds)
    return (bookId: string) => {
      const last = latest.get(bookId)
      return {
        readStatus: statuses.get(bookId) ?? ('unread' as const),
        lastRead: last
          ? {
              fileId: last.fileId,
              fraction: last.fraction,
              at: last.readAt,
              kind: last.duration == null ? ('text' as const) : ('audio' as const),
              duration: last.duration,
            }
          : null,
      }
    }
  }

  function detail(profileId: string, book: BookRow): z.infer<typeof BookDetail> {
    const fileRows = library.filesOf([book.id])
    const trackCounts = library.trackCounts(
      fileRows.filter((f) => f.format === 'audio').map((f) => f.id),
    )
    const owner = db
      .select({ name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, book.ownerProfileId))
      .get()
    return {
      id: book.id,
      title: book.title,
      authors: library.authorsOf([book.id]).get(book.id) ?? [],
      seriesName: book.seriesName,
      seriesIndex: book.seriesIndex,
      coverUrl: coverUrl(book),
      owned: book.ownerProfileId === profileId,
      sharedBy: book.ownerProfileId === profileId ? null : (owner?.name ?? ''),
      addedAt: library.addedAt(profileId, book.id) ?? book.addedAt,
      hidden: library.isHidden(profileId, book.id),
      share: book.ownerProfileId === profileId ? library.shareOf(book) : null,
      shelves: shelves.shelvesOf(profileId, book.id),
      description: book.description,
      language: book.language,
      publisher: book.publisher,
      publishedDate: book.publishedDate,
      isbn: book.isbn,
      tags: library.tagsOf(book.id),
      ownerName: owner?.name ?? '',
      updatedAt: book.updatedAt,
      formats: [...new Set(fileRows.map((f) => f.format as FileFormat))],
      ...readingState(profileId, [book.id])(book.id),
      files: fileRows.map((f) => ({
        id: f.id,
        format: f.format as FileFormat,
        originalName: f.originalName,
        size: f.size,
        readable: READABLE_FORMATS.has(f.format as FileFormat),
        kind: f.format === 'audio' ? ('audio' as const) : ('text' as const),
        duration: f.duration,
        trackCount: trackCounts.get(f.id) ?? 0,
        url: `/api/files/${f.id}`,
        addedAt: f.addedAt,
      })),
    }
  }

  // Bytes behind a File id never change, so the cache can keep them (ticket 05).
  function sendBlob(reply: FastifyReply, sha256: string) {
    reply.header('Cache-Control', 'private, max-age=31536000, immutable')
    const blob = blobs.pathFor(sha256)
    return reply.sendFile(path.basename(blob), path.dirname(blob), {
      cacheControl: false,
      contentType: false,
    })
  }

  /** Several Tracks download as one stored zip, built while it streams; nothing is kept. */
  function sendZip(reply: FastifyReply, name: string, tracks: FileTrackRow[]) {
    const zip = new ZipFile()
    const used = new Set<string>()
    for (const t of tracks) {
      const base = t.originalName.replace(/[/\\]/g, '_')
      let entry = base
      for (let n = 2; used.has(entry.toLowerCase()); n++) entry = `${n} ${base}`
      used.add(entry.toLowerCase())
      zip.addFile(blobs.pathFor(t.sha256), entry, { compress: false })
    }
    zip.end()
    reply.header('Content-Type', 'application/zip')
    reply.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(name.replace(/[/\\]/g, '_'))}`,
    )
    reply.header('Cache-Control', 'private, no-store')
    return reply.send(zip.outputStream)
  }

  return async (app) => {
    app.addHook('onRequest', requireProfile(db))

    // One file per request; the client uploads several in parallel (ticket 09).
    app.post(
      '/api/uploads',
      {
        schema: {
          operationId: 'uploadFile',
          consumes: ['multipart/form-data'],
          response: { 200: IngestResultBody, 400: ErrorBody, 413: ErrorBody },
        },
      },
      async (request) => {
        const part = await request.file({ limits: { fileSize: maxUploadBytes, files: 1 } })
        if (!part) throw new AppError(400, 'no_file', 'Send one file in the "file" field')
        const staged = await blobs.stage(part.file)
        if (part.file.truncated) {
          blobs.discard(staged)
          throw new AppError(413, 'too_large', `${part.filename} is larger than the upload limit`)
        }
        return ingest.ingest({ profileId: request.profile.id, staged, originalName: part.filename })
      },
    )

    // Every recording in one request, so the server can group them into Audio Files.
    app.post(
      '/api/uploads/audio',
      {
        schema: {
          operationId: 'uploadAudio',
          consumes: ['multipart/form-data'],
          response: {
            200: z.object({ results: z.array(IngestResultBody) }),
            400: ErrorBody,
            413: ErrorBody,
          },
        },
      },
      async (request) => {
        const staged: StagedTrack[] = []
        try {
          for await (const part of request.files({
            limits: { fileSize: maxUploadBytes, files: 2000 },
          })) {
            const file = await blobs.stage(part.file)
            staged.push({ staged: file, originalName: part.filename })
            if (part.file.truncated)
              throw new AppError(
                413,
                'too_large',
                `${part.filename} is larger than the upload limit`,
              )
            if (!isAudioName(part.filename))
              throw new AppError(400, 'not_audio', `${part.filename} isn't an audio file`)
          }
        } catch (error) {
          for (const t of staged) blobs.discard(t.staged)
          throw error
        }
        if (!staged.length) throw new AppError(400, 'no_file', 'Send at least one audio file')
        const { probed, failed } = await ingest.probe(staged)
        const results = groupTracks(probed.map((t) => ({ ...t.probed, t }))).map((group) =>
          ingest.ingestAudio({
            profileId: request.profile.id,
            tracks: group.map((g) => g.t),
            fallbackName: group[0]?.originalName ?? 'Audiobook',
          }),
        )
        return { results: [...results, ...failed] }
      },
    )

    app.get(
      '/api/books',
      {
        schema: {
          operationId: 'listBooks',
          querystring: z.object({
            q: z.string().max(200).optional(),
            status: z.enum(READ_STATUSES).optional(),
            author: z.string().optional(),
            series: z.string().optional(),
            tag: z.string().optional(),
            sort: z.enum(BOOK_SORTS).optional(),
            scope: z.enum(BOOK_SCOPES).optional(),
            /** A shelf of this Profile's. */
            shelf: z.string().optional(),
            /** `true` lists the Shared Books this Profile has hidden instead. */
            hidden: z.stringbool().optional(),
            /** `true` lists only Books with an Audio File. */
            audio: z.stringbool().optional(),
            /** Opaque; pass back `nextCursor` for the next page. */
            cursor: z.string().regex(/^\d+$/).optional(),
            limit: z.coerce.number().int().min(1).max(200).default(60),
          }),
          response: {
            200: z.object({
              books: z.array(BookSummary),
              total: z.number(),
              nextCursor: z.string().nullable(),
            }),
          },
        },
      },
      async (request) => {
        const { cursor, limit, ...filters } = request.query
        const offset = cursor ? Number(cursor) : 0
        const { rows: found, total } = search.list(request.profile.id, {
          ...filters,
          limit,
          offset,
        })
        const ids = found.map((r) => r.id)
        const addedAt = new Map(found.map((r) => [r.id, r.addedAt]))
        const byId = new Map(
          (ids.length ? db.select().from(books).where(inArray(books.id, ids)).all() : []).map(
            (b) => [b.id, b],
          ),
        )
        const rows = ids.flatMap((id) => byId.get(id) ?? [])
        const authors = library.authorsOf(ids)
        const fileRows = library.filesOf(ids)
        const stateOf = readingState(request.profile.id, ids)
        const owners = library.profileNames(rows.map((b) => b.ownerProfileId))
        const next = offset + ids.length
        return {
          books: rows.map((b) => ({
            id: b.id,
            title: b.title,
            authors: authors.get(b.id) ?? [],
            seriesName: b.seriesName,
            seriesIndex: b.seriesIndex,
            coverUrl: coverUrl(b),
            formats: [
              ...new Set(
                fileRows.filter((f) => f.bookId === b.id).map((f) => f.format as FileFormat),
              ),
            ],
            owned: b.ownerProfileId === request.profile.id,
            sharedBy:
              b.ownerProfileId === request.profile.id ? null : (owners.get(b.ownerProfileId) ?? ''),
            addedAt: addedAt.get(b.id) ?? b.addedAt,
            ...stateOf(b.id),
          })),
          total,
          nextCursor: next < total ? String(next) : null,
        }
      },
    )

    app.get(
      '/api/books/facets',
      {
        schema: {
          operationId: 'getBookFacets',
          response: {
            200: z.object({
              authors: z.array(Facet),
              series: z.array(Facet),
              tags: z.array(Facet),
              /** Books Shared with this Profile in its library, and Books it has hidden. */
              shared: z.number(),
              hidden: z.number(),
              /** Books with an Audio File. */
              audio: z.number(),
            }),
          },
        },
      },
      async (request) => search.facets(request.profile.id),
    )

    app.get(
      '/api/books/:bookId',
      {
        schema: {
          operationId: 'getBook',
          params: BookParams,
          response: { 200: BookDetail, 404: ErrorBody },
        },
      },
      async (request) =>
        detail(request.profile.id, library.visibleBook(request.profile.id, request.params.bookId)),
    )

    app.patch(
      '/api/books/:bookId',
      {
        schema: {
          operationId: 'updateBook',
          params: BookParams,
          body: BookPatch,
          response: { 200: BookDetail, 400: ErrorBody, 403: ErrorBody, 404: ErrorBody },
        },
      },
      async (request) => {
        const book = library.ownedBook(request.profile.id, request.params.bookId)
        const { authors, tags, title, isbn, ...fields } = request.body
        let normalisedIsbn: string | null | undefined = isbn
        if (isbn) {
          normalisedIsbn = normaliseIsbn(isbn)
          if (!normalisedIsbn)
            throw new AppError(400, 'invalid_isbn', `"${isbn}" is not a valid ISBN`)
        }
        const nextTitle = title ?? book.title
        db.transaction((tx) => {
          if (authors) {
            tx.delete(bookAuthors).where(eq(bookAuthors.bookId, book.id)).run()
            authors.forEach((name, position) => {
              tx.insert(bookAuthors).values({ bookId: book.id, position, name }).run()
            })
          }
          if (tags) {
            tx.delete(bookTags).where(eq(bookTags.bookId, book.id)).run()
            for (const tag of new Set(tags))
              tx.insert(bookTags).values({ bookId: book.id, tag }).run()
          }
          const firstAuthor =
            authors?.[0] ??
            tx
              .select({ name: bookAuthors.name })
              .from(bookAuthors)
              .where(eq(bookAuthors.bookId, book.id))
              .orderBy(bookAuthors.position)
              .get()?.name
          const defined = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined),
          )
          tx.update(books)
            .set({
              ...defined,
              ...(normalisedIsbn !== undefined && { isbn: normalisedIsbn }),
              title: nextTitle,
              sortTitle: sortTitle(nextTitle),
              matchKey: matchKey(nextTitle, firstAuthor),
              updatedAt: Date.now(),
            })
            .where(eq(books.id, book.id))
            .run()
        })
        return detail(request.profile.id, library.visibleBook(request.profile.id, book.id))
      },
    )

    app.put(
      '/api/books/:bookId/share',
      {
        schema: {
          operationId: 'shareBook',
          params: BookParams,
          body: z.object({
            mode: z.enum(SHARE_MODES),
            /** The named Recipients, for `named`; ignored otherwise. */
            profileIds: z.array(z.string()).max(1000).default([]),
          }),
          response: { 200: ShareBody, 400: ErrorBody, 403: ErrorBody, 404: ErrorBody },
        },
      },
      async (request) =>
        library.setShare(
          request.profile.id,
          request.params.bookId,
          request.body.mode,
          request.body.profileIds,
        ),
    )

    app.post(
      '/api/books/:bookId/merge',
      {
        schema: {
          operationId: 'mergeBook',
          params: BookParams,
          body: z.object({ targetId: z.string() }),
          response: { 200: BookDetail, 400: ErrorBody, 403: ErrorBody, 404: ErrorBody },
        },
      },
      async (request) =>
        detail(
          request.profile.id,
          reshape.merge(request.profile.id, request.params.bookId, request.body.targetId),
        ),
    )

    app.post(
      '/api/files/:fileId/split',
      {
        schema: {
          operationId: 'splitFile',
          params: FileParams,
          response: { 200: BookDetail, 403: ErrorBody, 404: ErrorBody, 409: ErrorBody },
        },
      },
      async (request) =>
        detail(request.profile.id, await reshape.split(request.profile.id, request.params.fileId)),
    )

    app.put(
      '/api/books/:bookId/hidden',
      {
        schema: {
          operationId: 'setBookHidden',
          params: BookParams,
          body: z.object({ hidden: z.boolean() }),
          response: { 204: z.null(), 404: ErrorBody, 409: ErrorBody },
        },
      },
      async (request, reply) => {
        library.setHidden(request.profile.id, request.params.bookId, request.body.hidden)
        return reply.code(204).send(null)
      },
    )

    app.delete(
      '/api/books/:bookId',
      {
        schema: {
          operationId: 'deleteBook',
          params: BookParams,
          response: { 204: z.null(), 403: ErrorBody, 404: ErrorBody },
        },
      },
      async (request, reply) => {
        const book = library.ownedBook(request.profile.id, request.params.bookId)
        library.deleteBooks([book.id])
        return reply.code(204).send(null)
      },
    )

    app.get(
      '/api/books/:bookId/cover',
      { schema: { operationId: 'getBookCover', params: BookParams } },
      async (request, reply) => {
        const book = library.visibleBook(request.profile.id, request.params.bookId)
        const cover = library.coverPath(book)
        if (!cover) throw notFound('Cover')
        reply.header('Cache-Control', 'private, max-age=86400')
        return reply.sendFile(path.basename(cover), library.coversDir)
      },
    )

    // Range requests come from @fastify/send, so the reader can fetch parts of a File (ticket 04).
    app.get(
      '/api/files/:fileId',
      {
        schema: {
          operationId: 'getFile',
          params: FileParams,
          querystring: z.object({ download: z.enum(['1']).optional() }),
        },
      },
      async (request, reply) => {
        const { file, book } = library.visibleFile(request.profile.id, request.params.fileId)
        const disposition = request.query.download ? 'attachment' : 'inline'
        const tracks = file.format === 'audio' ? library.tracksOf(file.id) : []
        if (tracks.length > 1) return sendZip(reply, `${book.title}.zip`, tracks)
        const track = tracks[0]
        reply.header(
          'Content-Type',
          track?.mime ?? CONTENT_TYPES[file.format as FileFormat] ?? CONTENT_TYPES.other,
        )
        reply.header(
          'Content-Disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(track?.originalName ?? file.originalName)}`,
        )
        return sendBlob(reply, track?.sha256 ?? file.sha256)
      },
    )

    // One recording of an Audio File, for the player; seeking uses range requests.
    app.get(
      '/api/files/:fileId/tracks/:position',
      {
        schema: {
          operationId: 'getTrack',
          params: FileParams.extend({ position: z.coerce.number().int().min(0) }),
        },
      },
      async (request, reply) => {
        const { file } = library.visibleFile(request.profile.id, request.params.fileId)
        const track = library.tracksOf(file.id)[request.params.position]
        if (!track) throw notFound('Track')
        reply.header('Content-Type', track.mime)
        return sendBlob(reply, track.sha256)
      },
    )

    app.get(
      '/api/files/:fileId/info',
      {
        schema: {
          operationId: 'getFileInfo',
          params: FileParams,
          response: {
            200: z.object({
              id: z.string(),
              bookId: z.string(),
              title: z.string(),
              format: Format,
              readable: z.boolean(),
              url: z.string(),
              /** The rest are for Audio Files only. */
              duration: z.number().nullable(),
              tracks: z.array(
                z.object({
                  position: z.number(),
                  title: z.string().nullable(),
                  duration: z.number(),
                  mime: z.string(),
                  size: z.number(),
                  url: z.string(),
                }),
              ),
              /** `start` is seconds from the start of the whole Audio File. */
              chapters: z.array(z.object({ title: z.string(), start: z.number() })),
              coverUrl: z.string().nullable(),
              authors: z.array(z.string()),
            }),
            404: ErrorBody,
          },
        },
      },
      async (request) => {
        const { file, book } = library.visibleFile(request.profile.id, request.params.fileId)
        return {
          id: file.id,
          bookId: book.id,
          title: book.title,
          format: file.format as FileFormat,
          readable: READABLE_FORMATS.has(file.format as FileFormat),
          url: `/api/files/${file.id}`,
          duration: file.duration,
          tracks: library.tracksOf(file.id).map((t) => ({
            position: t.position,
            title: t.title,
            duration: t.duration,
            mime: t.mime,
            size: t.size,
            url: `/api/files/${file.id}/tracks/${t.position}`,
          })),
          chapters: library.chaptersOf(file.id),
          coverUrl: coverUrl(book),
          authors: library.authorsOf([book.id]).get(book.id) ?? [],
        }
      },
    )

    app.delete(
      '/api/files/:fileId',
      {
        schema: {
          operationId: 'deleteFile',
          params: FileParams,
          response: { 204: z.null(), 403: ErrorBody, 404: ErrorBody, 409: ErrorBody },
        },
      },
      async (request, reply) => {
        library.removeFile(request.profile.id, request.params.fileId)
        return reply.code(204).send(null)
      },
    )
  }
}
