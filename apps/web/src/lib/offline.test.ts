import { act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { offlineStore } from '@/sync'
import { reply, route } from '@/test/api'
import { audioFile, bookDetail, bookFile } from '@/test/fixtures'
import { renderQueryHook } from '@/test/render'
import {
  isUnreachable,
  offlineBytes,
  offlineSource,
  remembered,
  useOfflineBooks,
  useRemoveOffline,
  useSaveOffline,
  useStorageInfo,
} from './offline'

describe('isUnreachable', () => {
  it('is a network failure or a gateway error', () => {
    expect(isUnreachable(new TypeError('Failed to fetch'))).toBe(true)
    expect(isUnreachable(new ApiError(503, 'x', 'down'))).toBe(true)
    expect(isUnreachable(new ApiError(500, 'x', 'boom'))).toBe(false)
    expect(isUnreachable(new Error('other'))).toBe(false)
  })
})

describe('remembered', () => {
  it('stores the answer and falls back to it when unreachable', async () => {
    expect(await remembered('k', async () => 1)).toBe(1)
    expect(await remembered('k', () => Promise.reject(new TypeError('offline')))).toBe(1)
  })

  it('rethrows real errors and misses', async () => {
    localStorage.setItem('k', '1')
    await expect(remembered('k', () => Promise.reject(new Error('bad')))).rejects.toThrow('bad')
    await expect(remembered('other', () => Promise.reject(new TypeError('x')))).rejects.toThrow('x')
  })
})

const audioInfo = {
  id: 'a1',
  bookId: 'b1',
  title: 'Dune',
  format: 'audio',
  readable: false,
  url: '/api/files/a1',
  duration: null,
  tracks: [
    {
      position: 1,
      title: 'One',
      duration: 10,
      mime: 'audio/mpeg',
      size: 3,
      url: '/api/files/a1/tracks/1',
    },
  ],
  chapters: [{ title: 'Ch 1', start: 0 }],
  coverUrl: null,
  authors: [],
}

describe('offlineSource', () => {
  it('keeps readable Files and brings Audio Files with their Tracks', async () => {
    route('GET /api/files/:id/info', audioInfo)
    const book = bookDetail({
      files: [bookFile(), bookFile({ id: 'f2', format: 'pdf', readable: false }), audioFile()],
    })
    const source = await offlineSource(book)
    expect(source.files.map((f) => f.id)).toEqual(['f1', 'a1'])
    expect(source.files[1]?.audio).toEqual({
      duration: 0,
      tracks: [{ url: '/api/files/a1/tracks/1', duration: 10, title: 'One', size: 3 }],
      chapters: [{ title: 'Ch 1', start: 0 }],
    })
    expect(offlineBytes(book)).toBe(2048 + 50_000_000)
  })
})

describe('saving and removing', () => {
  it('saves Books offline with progress, lists them and removes them', async () => {
    route('GET /api/books/:id', ({ path }) =>
      path.endsWith('b2')
        ? bookDetail({ id: 'b2', files: [bookFile({ id: 'f2', readable: false, format: 'pdf' })] })
        : bookDetail({ files: [bookFile({ size: 4 })] }),
    )
    route('GET /api/files/:id', () => new Response('book', { headers: { 'content-length': '4' } }))
    const save = renderQueryHook(() => useSaveOffline('p-offline'))
    const list = renderQueryHook(() => useOfflineBooks('p-offline'), save.queryClient)
    await waitFor(() => expect(list.result.current.data).toEqual([]))

    await act(() => save.result.current.mutateAsync(['b1', 'b2']))
    expect(save.result.current.progress).toBeNull()
    await waitFor(() => expect(list.result.current.data?.map((b) => b.bookId)).toEqual(['b1']))

    const remove = renderQueryHook(() => useRemoveOffline('p-offline'), save.queryClient)
    await act(() => remove.result.current.mutateAsync(['b1']))
    await waitFor(() => expect(list.result.current.data).toEqual([]))
  })

  it('removes every Book at once', async () => {
    await offlineStore.save('p-all', {
      id: 'b1',
      title: 'Dune',
      authors: [],
      coverUrl: null,
      sharedBy: null,
      files: [],
    })
    const remove = renderQueryHook(() => useRemoveOffline('p-all'))
    await act(() => remove.result.current.mutateAsync('all'))
    expect(await offlineStore.list('p-all')).toEqual([])
  })

  it('stops showing progress when a save fails', async () => {
    route('GET /api/books/:id', reply(500))
    const save = renderQueryHook(() => useSaveOffline('p-fail'))
    await act(() => save.result.current.mutateAsync(['b1']).catch(() => {}))
    expect(save.result.current.progress).toBeNull()
  })

  it('does not list without a Profile', () => {
    const { result } = renderQueryHook(() => useOfflineBooks(undefined))
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useStorageInfo', () => {
  const stubStorage = (storage: unknown) =>
    Object.defineProperty(navigator, 'storage', { value: storage, configurable: true })
  afterEach(() => stubStorage(undefined))

  it('reports usage, quota and persistence', async () => {
    stubStorage({ estimate: async () => ({ usage: 10, quota: 100 }), persisted: async () => true })
    const { result } = renderQueryHook(() => useStorageInfo())
    await waitFor(() =>
      expect(result.current.data).toEqual({ usage: 10, quota: 100, persisted: true }),
    )
  })

  it('copes with a browser that has no storage manager', async () => {
    stubStorage(undefined)
    const { result } = renderQueryHook(() => useStorageInfo())
    await waitFor(() =>
      expect(result.current.data).toEqual({ usage: null, quota: null, persisted: false }),
    )
  })
})
