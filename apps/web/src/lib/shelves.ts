import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { bookKeys } from './books'

export type Shelf = Awaited<ReturnType<typeof listShelves>>['shelves'][number]

export const shelfKeys = { all: ['shelves'] as const }

function listShelves() {
  return unwrap(api.GET('/api/shelves'))
}

export function useShelves() {
  return useQuery({ queryKey: shelfKeys.all, queryFn: listShelves, select: (d) => d.shelves })
}

/** Shelf changes move counts, Book detail and the shelf filter, so all of those refetch. */
function useShelfMutation<A, R>(fn: (args: A) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: shelfKeys.all }),
        queryClient.invalidateQueries({ queryKey: bookKeys.all }),
      ]),
  })
}

export function useCreateShelf() {
  return useShelfMutation((name: string) => unwrap(api.POST('/api/shelves', { body: { name } })))
}

export function useRenameShelf() {
  return useShelfMutation(({ shelfId, name }: { shelfId: string; name: string }) =>
    unwrap(api.PATCH('/api/shelves/{shelfId}', { params: { path: { shelfId } }, body: { name } })),
  )
}

export function useDeleteShelf() {
  return useShelfMutation((shelfId: string) =>
    unwrap(api.DELETE('/api/shelves/{shelfId}', { params: { path: { shelfId } } })),
  )
}

export function useUpdateShelfBooks() {
  return useShelfMutation(
    ({ shelfId, add = [], remove = [] }: { shelfId: string; add?: string[]; remove?: string[] }) =>
      unwrap(
        api.POST('/api/shelves/{shelfId}/books', {
          params: { path: { shelfId } },
          body: { add, remove },
        }),
      ),
  )
}
