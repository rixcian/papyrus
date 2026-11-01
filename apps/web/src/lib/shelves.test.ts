import { act, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { callsTo, reply, route } from '@/test/api'
import { renderQueryHook } from '@/test/render'
import {
  shelfKeys,
  useCreateShelf,
  useDeleteShelf,
  useRenameShelf,
  useShelves,
  useUpdateShelfBooks,
} from './shelves'

it('lists Shelves', async () => {
  route('GET /api/shelves', { shelves: [{ id: 's1', name: 'Sci-fi', bookCount: 2 }] })
  const { result } = renderQueryHook(() => useShelves())
  await waitFor(() =>
    expect(result.current.data).toEqual([{ id: 's1', name: 'Sci-fi', bookCount: 2 }]),
  )
})

it('creates, renames, fills and deletes Shelves, refetching Shelves and Books', async () => {
  route('POST /api/shelves', { id: 's1', name: 'Sci-fi' })
  route('PATCH /api/shelves/:id', { id: 's1', name: 'SF' })
  route('POST /api/shelves/:id/books', {})
  route('DELETE /api/shelves/:id', reply(204))
  const create = renderQueryHook(() => useCreateShelf())
  create.queryClient.setQueryData(shelfKeys.all, { shelves: [] })
  create.queryClient.setQueryData(['books', 'list'], { books: [] })
  await act(() => create.result.current.mutateAsync('Sci-fi'))
  expect(create.queryClient.getQueryState(shelfKeys.all)?.isInvalidated).toBe(true)
  expect(create.queryClient.getQueryState(['books', 'list'])?.isInvalidated).toBe(true)

  const rename = renderQueryHook(() => useRenameShelf())
  await act(() => rename.result.current.mutateAsync({ shelfId: 's1', name: 'SF' }))
  const fill = renderQueryHook(() => useUpdateShelfBooks())
  await act(() => fill.result.current.mutateAsync({ shelfId: 's1', add: ['b1'] }))
  const del = renderQueryHook(() => useDeleteShelf())
  await act(() => del.result.current.mutateAsync('s1'))

  expect(callsTo('POST /api/shelves')[0]?.body).toEqual({ name: 'Sci-fi' })
  expect(callsTo('PATCH /api/shelves/:id')[0]?.body).toEqual({ name: 'SF' })
  expect(callsTo('POST /api/shelves/:id/books')[0]?.body).toEqual({ add: ['b1'], remove: [] })
  expect(callsTo('DELETE /api/shelves/:id')[0]?.path).toBe('/api/shelves/s1')
})
