import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ApiSchemas, api, unwrap } from '@/api/client'
import type { operations } from '@/api/schema'
import { type ReadStatus, syncEngine } from '@/sync'

export type BookSummary = Awaited<ReturnType<typeof listBooks>>['books'][number]
export type BookDetail = Awaited<ReturnType<typeof getBook>>
export type BookFile = BookDetail['files'][number]
/** Search, filters and sort for the library; every field is optional (ticket 06). */
export type LibraryQuery = Omit<
  NonNullable<operations['listBooks']['parameters']['query']>,
  'cursor' | 'limit'
>
export type BookSort = NonNullable<LibraryQuery['sort']>
export type Facet = Awaited<ReturnType<typeof getFacets>>['authors'][number]
export type BookPatch = NonNullable<
  operations['updateBook']['requestBody']
>['content']['application/json']

export type IngestResult = {
  status: 'created' | 'attached' | 'duplicate' | 'failed'
  bookId?: string
  title?: string
  message?: string
}

export const bookKeys = {
  all: ['books'] as const,
  list: ['books', 'list'] as const,
  filtered: (query: LibraryQuery) => ['books', 'list', query] as const,
  continueReading: ['books', 'list', 'continue'] as const,
  facets: ['books', 'facets'] as const,
  detail: (id: string) => ['books', 'detail', id] as const,
}

const PAGE_SIZE = 60

function listBooks(query: LibraryQuery & { cursor?: string; limit?: number }) {
  return unwrap(api.GET('/api/books', { params: { query } }))
}

function getFacets() {
  return unwrap(api.GET('/api/books/facets'))
}

function getBook(bookId: string) {
  return unwrap(api.GET('/api/books/{bookId}', { params: { path: { bookId } } }))
}

function updateBook(bookId: string, body: BookPatch) {
  return unwrap(api.PATCH('/api/books/{bookId}', { params: { path: { bookId } }, body }))
}

/** The library, a page at a time, for the virtualised grid and list (ticket 06). */
export function useBookList(query: LibraryQuery) {
  return useInfiniteQuery({
    queryKey: bookKeys.filtered(query),
    queryFn: ({ pageParam }) =>
      listBooks({ ...query, limit: PAGE_SIZE, ...(pageParam && { cursor: pageParam }) }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: (previous) => previous,
  })
}

/** Books being read, the most recently read first. */
export function useContinueReading() {
  return useQuery({
    queryKey: bookKeys.continueReading,
    queryFn: () => listBooks({ status: 'reading', sort: 'recent', limit: 12 }),
    select: (data) => data.books.filter((b) => b.lastRead),
  })
}

export function useFacets() {
  return useQuery({ queryKey: bookKeys.facets, queryFn: getFacets })
}

/**
 * Read Status goes through the outbox like all reading state, so it works offline; the
 * cached Book updates straight away (ticket 08).
 */
export function useSetReadStatus(profileId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ bookId, status }: { bookId: string; status: ReadStatus }) => {
      await syncEngine.record(profileId, { kind: 'readStatus', bookId, status })
      void syncEngine.flush(profileId)
    },
    onMutate: ({ bookId, status }) => {
      queryClient.setQueryData<BookDetail>(bookKeys.detail(bookId), (b) =>
        b ? { ...b, readStatus: status } : b,
      )
    },
  })
}

export function useBook(bookId: string) {
  return useQuery({ queryKey: bookKeys.detail(bookId), queryFn: () => getBook(bookId) })
}

/**
 * Refetches the library and Book detail afterwards. `gone` names Books the mutation
 * removed: their detail would only 404 while the page showing them navigates away.
 */
function useBookMutation<A, R>(fn: (args: A) => Promise<R>, gone?: (args: A) => string[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (_result, args) => {
      const removed = new Set(gone?.(args) ?? [])
      return queryClient.invalidateQueries({
        queryKey: bookKeys.all,
        predicate: (q) => !(q.queryKey[1] === 'detail' && removed.has(q.queryKey[2] as string)),
      })
    },
  })
}

export type ShareState = NonNullable<BookDetail['share']>
export type ShareMode = ShareState['mode']

/**
 * Only the Owning Profile can Share (ticket 06). Several Books at once for multi-select; the
 * server takes one Book per request.
 */
export function useShareBooks() {
  return useBookMutation(
    ({ bookIds, mode, profileIds }: { bookIds: string[]; mode: ShareMode; profileIds: string[] }) =>
      Promise.all(
        bookIds.map((bookId) =>
          unwrap(
            api.PUT('/api/books/{bookId}/share', {
              params: { path: { bookId } },
              body: { mode, profileIds },
            }),
          ),
        ),
      ),
  )
}

/** A Recipient's "remove from my library", and undoing it. */
export function useSetHidden() {
  return useBookMutation(({ bookIds, hidden }: { bookIds: string[]; hidden: boolean }) =>
    Promise.all(
      bookIds.map((bookId) =>
        unwrap(
          api.PUT('/api/books/{bookId}/hidden', {
            params: { path: { bookId } },
            body: { hidden },
          }),
        ),
      ),
    ),
  )
}

export function useUpdateBook(bookId: string) {
  return useBookMutation((body: BookPatch) => updateBook(bookId, body))
}

export function useDeleteBooks() {
  return useBookMutation(
    (bookIds: string[]) =>
      Promise.all(
        bookIds.map((bookId) =>
          unwrap(api.DELETE('/api/books/{bookId}', { params: { path: { bookId } } })),
        ),
      ),
    (bookIds) => bookIds,
  )
}

/** Moves every File of one of the Profile's Books into another and deletes it (ticket 09). */
export function useMergeBook() {
  return useBookMutation(
    ({ bookId, targetId }: { bookId: string; targetId: string }) =>
      unwrap(
        api.POST('/api/books/{bookId}/merge', {
          params: { path: { bookId } },
          body: { targetId },
        }),
      ),
    ({ bookId }) => [bookId],
  )
}

/** Moves a File into a new Book of its own, which the result describes. */
export function useSplitFile() {
  return useBookMutation((fileId: string) =>
    unwrap(api.POST('/api/files/{fileId}/split', { params: { path: { fileId } } })),
  )
}

/** Downloads an Open Library cover onto the Book (ticket 09: Find online). */
export function useSetCover(bookId: string) {
  return useBookMutation((coverId: number) =>
    unwrap(
      api.PUT('/api/books/{bookId}/cover', { params: { path: { bookId } }, body: { coverId } }),
    ),
  )
}

export function useDeleteFile() {
  return useBookMutation((fileId: string) =>
    unwrap(api.DELETE('/api/files/{fileId}', { params: { path: { fileId } } })),
  )
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** XHR rather than fetch, for upload progress. One file per request (ticket 09). */
export function uploadFile(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<IngestResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/uploads')
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      const body = xhr.response as (IngestResult & { error?: string }) | null
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body)
      else resolve({ status: 'failed', message: body?.message ?? `Upload failed (${xhr.status})` })
    }
    xhr.onerror = () => reject(new Error('Network error'))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

export type { ApiSchemas }
