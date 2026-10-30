import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ApiSchemas, api, unwrap } from '@/api/client'
import type { operations } from '@/api/schema'

export type BookSummary = Awaited<ReturnType<typeof listBooks>>['books'][number]
export type BookDetail = Awaited<ReturnType<typeof getBook>>
export type BookFile = BookDetail['files'][number]
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
  detail: (id: string) => ['books', 'detail', id] as const,
}

function listBooks() {
  return unwrap(api.GET('/api/books'))
}

function getBook(bookId: string) {
  return unwrap(api.GET('/api/books/{bookId}', { params: { path: { bookId } } }))
}

function updateBook(bookId: string, body: BookPatch) {
  return unwrap(api.PATCH('/api/books/{bookId}', { params: { path: { bookId } }, body }))
}

export function useBooks() {
  return useQuery({ queryKey: bookKeys.list, queryFn: listBooks })
}

export function useBook(bookId: string) {
  return useQuery({ queryKey: bookKeys.detail(bookId), queryFn: () => getBook(bookId) })
}

function useBookMutation<A, R>(fn: (args: A) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookKeys.all }),
  })
}

export function useUpdateBook(bookId: string) {
  return useBookMutation((body: BookPatch) => updateBook(bookId, body))
}

export function useDeleteBook() {
  return useBookMutation((bookId: string) =>
    unwrap(api.DELETE('/api/books/{bookId}', { params: { path: { bookId } } })),
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
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
