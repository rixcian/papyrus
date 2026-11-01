import { act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callsTo, reply, route } from '@/test/api'
import { bookDetail, bookSummary } from '@/test/fixtures'
import { renderQueryHook } from '@/test/render'
import {
  bookKeys,
  formatSize,
  isAudioFile,
  uploadFiles,
  useBook,
  useBookList,
  useContinueReading,
  useDeleteBooks,
  useDeleteFile,
  useFacets,
  useMergeBook,
  useSetCover,
  useSetHidden,
  useSetReadStatus,
  useShareBooks,
  useSplitFile,
  useUpdateBook,
} from './books'

describe('queries', () => {
  it('pages through the library with the cursor', async () => {
    route('GET /api/books', ({ query }) =>
      query.get('cursor')
        ? { books: [bookSummary({ id: 'b2' })], total: 2, nextCursor: null }
        : { books: [bookSummary()], total: 2, nextCursor: 'next' },
    )
    const { result } = renderQueryHook(() => useBookList({ q: 'dune' }))
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
    expect(result.current.hasNextPage).toBe(true)
    await act(() => result.current.fetchNextPage())
    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((p) => p.books.map((b) => b.id))).toEqual([
        'b1',
        'b2',
      ]),
    )
    expect(result.current.hasNextPage).toBe(false)
    const [first, second] = callsTo('GET /api/books')
    expect(first?.query.get('q')).toBe('dune')
    expect(first?.query.get('limit')).toBe('60')
    expect(second?.query.get('cursor')).toBe('next')
  })

  it('continue reading lists only Books with a last read', async () => {
    const lastRead = { fileId: 'f1', fraction: 0.3, at: 1, kind: 'text' as const, duration: null }
    route('GET /api/books', {
      books: [bookSummary({ id: 'b1', lastRead }), bookSummary({ id: 'b2' })],
      total: 2,
      nextCursor: null,
    })
    const { result } = renderQueryHook(() => useContinueReading())
    await waitFor(() => expect(result.current.data?.map((b) => b.id)).toEqual(['b1']))
    expect(callsTo('GET /api/books')[0]?.query.get('status')).toBe('reading')
  })

  it('loads facets and Book detail', async () => {
    route('GET /api/books/:bookId', bookDetail())
    route('GET /api/books/facets', { authors: [], series: [], tags: [] })
    const facets = renderQueryHook(() => useFacets())
    const book = renderQueryHook(() => useBook('b1'))
    await waitFor(() =>
      expect(facets.result.current.data).toEqual({ authors: [], series: [], tags: [] }),
    )
    await waitFor(() => expect(book.result.current.data?.title).toBe('Dune'))
  })
})

describe('mutations', () => {
  it('sets Read Status through the outbox and updates the cached Book at once', async () => {
    const { result, queryClient } = renderQueryHook(() => useSetReadStatus('p-books'))
    queryClient.setQueryData(bookKeys.detail('b1'), bookDetail())
    await act(() => result.current.mutateAsync({ bookId: 'b1', status: 'finished' }))
    expect(queryClient.getQueryData(bookKeys.detail('b1'))).toMatchObject({
      readStatus: 'finished',
    })
    await waitFor(() =>
      expect(
        callsTo('POST /api/sync').some((c) => JSON.stringify(c.body).includes('finished')),
      ).toBe(true),
    )
  })

  it('leaves an uncached Book alone when setting Read Status', async () => {
    const { result, queryClient } = renderQueryHook(() => useSetReadStatus('p-books'))
    await act(() => result.current.mutateAsync({ bookId: 'b9', status: 'reading' }))
    expect(queryClient.getQueryData(bookKeys.detail('b9'))).toBeUndefined()
  })

  it('shares and hides every Book given, one request each', async () => {
    route('PUT /api/books/:id/share', {})
    route('PUT /api/books/:id/hidden', {})
    const share = renderQueryHook(() => useShareBooks())
    const hide = renderQueryHook(() => useSetHidden())
    await act(() =>
      share.result.current.mutateAsync({ bookIds: ['b1', 'b2'], mode: 'named', profileIds: ['p'] }),
    )
    await act(() => hide.result.current.mutateAsync({ bookIds: ['b1'], hidden: true }))
    expect(callsTo('PUT /api/books/:id/share').map((c) => c.path)).toEqual([
      '/api/books/b1/share',
      '/api/books/b2/share',
    ])
    expect(callsTo('PUT /api/books/:id/hidden')[0]?.body).toEqual({ hidden: true })
  })

  it('refetches the library but not the detail of deleted Books', async () => {
    route('DELETE /api/books/:id', reply(204))
    route('GET /api/books/:id', bookDetail())
    const { result, queryClient } = renderQueryHook(() => useDeleteBooks())
    queryClient.setQueryData(bookKeys.detail('b1'), bookDetail())
    queryClient.setQueryData(bookKeys.detail('b2'), bookDetail({ id: 'b2' }))
    await act(() => result.current.mutateAsync(['b1']))
    expect(queryClient.getQueryState(bookKeys.detail('b1'))?.isInvalidated).toBe(false)
    expect(queryClient.getQueryState(bookKeys.detail('b2'))?.isInvalidated).toBe(true)
  })

  it('updates, merges, splits, sets covers and deletes Files', async () => {
    route('PATCH /api/books/:id', bookDetail({ title: 'Dune Messiah' }))
    route('POST /api/books/:id/merge', bookDetail())
    route('POST /api/files/:id/split', bookDetail({ id: 'b3' }))
    route('PUT /api/books/:id/cover', bookDetail())
    route('DELETE /api/files/:id', reply(204))
    const update = renderQueryHook(() => useUpdateBook('b1'))
    const merge = renderQueryHook(() => useMergeBook())
    const split = renderQueryHook(() => useSplitFile())
    const cover = renderQueryHook(() => useSetCover('b1'))
    const del = renderQueryHook(() => useDeleteFile())
    await act(() => update.result.current.mutateAsync({ title: 'Dune Messiah' }))
    await act(() => merge.result.current.mutateAsync({ bookId: 'b2', targetId: 'b1' }))
    await act(() => split.result.current.mutateAsync('f2'))
    await act(() => cover.result.current.mutateAsync(42))
    await act(() => del.result.current.mutateAsync('f2'))
    expect(callsTo('PATCH /api/books/:id')[0]?.body).toEqual({ title: 'Dune Messiah' })
    expect(callsTo('POST /api/books/:id/merge')[0]).toMatchObject({
      path: '/api/books/b2/merge',
      body: { targetId: 'b1' },
    })
    expect(callsTo('POST /api/files/:id/split')[0]?.path).toBe('/api/files/f2/split')
    expect(callsTo('PUT /api/books/:id/cover')[0]?.body).toEqual({ coverId: 42 })
    expect(callsTo('DELETE /api/files/:id')).toHaveLength(1)
  })
})

describe('formatSize', () => {
  it.each([
    [512, '512 B'],
    [2048, '2 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('%d bytes is %s', (bytes, text) => expect(formatSize(bytes)).toBe(text))
})

it('knows audio files by extension', () => {
  expect(isAudioFile(new File([], 'track.M4B'))).toBe(true)
  expect(isAudioFile(new File([], 'book.epub'))).toBe(false)
})

describe('uploadFiles', () => {
  class FakeXhr {
    static last: FakeXhr
    status = 200
    response: unknown = null
    responseType = ''
    method = ''
    url = ''
    sent: FormData | undefined
    upload: {
      onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void
    } = {}
    onload?: () => void
    onerror?: () => void
    constructor() {
      FakeXhr.last = this
    }
    open(method: string, url: string) {
      this.method = method
      this.url = url
    }
    send(form: FormData) {
      this.sent = form
    }
  }

  afterEach(() => vi.unstubAllGlobals())

  function start(audio = false) {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const progress: number[] = []
    const files = [new File(['a'], 'a.epub'), new File(['b'], 'b.epub')]
    const done = uploadFiles(files, audio, (f) => progress.push(f))
    return { xhr: FakeXhr.last, done, progress }
  }

  it('posts every file and reports progress', async () => {
    const { xhr, done, progress } = start()
    expect(xhr.url).toBe('/api/uploads')
    expect(xhr.sent?.getAll('file')).toHaveLength(2)
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 })
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 2, total: 0 })
    xhr.response = { status: 'created', bookId: 'b1' }
    xhr.onload?.()
    expect(await done).toEqual([{ status: 'created', bookId: 'b1' }])
    expect(progress).toEqual([0.25])
  })

  it('sends audio to its own endpoint and returns every result', async () => {
    const { xhr, done } = start(true)
    expect(xhr.url).toBe('/api/uploads/audio')
    xhr.response = { results: [{ status: 'created' }, { status: 'attached' }] }
    xhr.onload?.()
    expect(await done).toHaveLength(2)
  })

  it('turns a rejected upload into a failed result', async () => {
    const { xhr, done } = start()
    xhr.status = 413
    xhr.response = { message: 'Too large' }
    xhr.onload?.()
    expect(await done).toEqual([{ status: 'failed', message: 'Too large' }])
  })

  it('names the status when the server says nothing', async () => {
    const { xhr, done } = start()
    xhr.status = 500
    xhr.onload?.()
    expect(await done).toEqual([{ status: 'failed', message: 'Upload failed (500)' }])
  })

  it('rejects on a network error', async () => {
    const { xhr, done } = start()
    xhr.onerror?.()
    await expect(done).rejects.toThrow('Network error')
  })
})
