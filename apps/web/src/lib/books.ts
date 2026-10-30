import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

export type BookSummary = NonNullable<Awaited<ReturnType<typeof listBooks>>>['books'][number]

export type IngestResult = {
  status: 'created' | 'attached' | 'duplicate' | 'failed'
  bookId?: string
  title?: string
  message?: string
}

export const bookKeys = { list: ['books', 'list'] as const }

function listBooks() {
  return unwrap(api.GET('/api/books'))
}

export function useBooks() {
  return useQuery({ queryKey: bookKeys.list, queryFn: listBooks })
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
