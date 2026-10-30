import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' })

export type ApiSchemas = components['schemas']

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

interface FetchResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Returns the body of a successful call; turns `{ error, message }` bodies into ApiError. */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await call
  if (!response.ok) {
    const body = (error ?? {}) as { error?: string; message?: string }
    throw new ApiError(
      response.status,
      body.error ?? 'unknown',
      body.message ?? `Request failed (${response.status})`,
    )
  }
  return data as T
}
