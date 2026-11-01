import { act, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, route } from '@/test/api'
import { renderQueryHook } from '@/test/render'
import { offlineStore, syncEngine, useSync } from './index'

describe('useSync', () => {
  it('flushes on start, on reconnect and when the tab hides or shows', async () => {
    const { unmount } = renderQueryHook(() => useSync('p-sync'))
    await waitFor(() => expect(callsTo('POST /api/sync')).toHaveLength(1))
    expect(callsTo('POST /api/sync')[0]?.body).toMatchObject({ profileId: 'p-sync' })

    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(callsTo('POST /api/sync')).toHaveLength(2))

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(callsTo('POST /api/sync')).toHaveLength(3))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(callsTo('POST /api/sync')).toHaveLength(4))

    unmount()
    window.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 20))
    expect(callsTo('POST /api/sync')).toHaveLength(4)
  })

  it('does nothing without a Profile', async () => {
    renderQueryHook(() => useSync(undefined))
    await new Promise((r) => setTimeout(r, 20))
    expect(callsTo('POST /api/sync')).toHaveLength(0)
  })

  it('refetches Books when a sync pulls changes', async () => {
    route('POST /api/sync', {
      cursor: 5,
      records: [
        { kind: 'readStatus', bookId: 'b1', status: 'finished', hlc: '0000000000001-0000-dev' },
      ],
    })
    const { queryClient } = renderQueryHook(() => useSync('p-pull'))
    queryClient.setQueryData(['books', 'list'], { books: [] })
    await waitFor(() =>
      expect(queryClient.getQueryState(['books', 'list'])?.isInvalidated).toBe(true),
    )
  })

  it('tells the engine which Books are offline and evicts the ones it must', async () => {
    await offlineStore.save('p-evict', {
      id: 'b1',
      title: 'Dune',
      authors: [],
      coverUrl: null,
      sharedBy: null,
      files: [],
    })
    route('POST /api/sync', { cursor: 1, records: [], evict: ['b1'] })
    await act(() => syncEngine.flush('p-evict'))
    expect(callsTo('POST /api/sync').at(-1)?.body).toMatchObject({ offlineBookIds: ['b1'] })
    expect(await offlineStore.list('p-evict')).toEqual([])
  })
})
