import { vi } from 'vitest'

/** One call the web app made to the server. */
export interface ApiCall {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
}

type Reply = { status?: number; body?: unknown } | Response
type Handler = (call: ApiCall) => Reply | unknown | Promise<Reply | unknown>

const routes: { method: string; pattern: RegExp; handler: Handler }[] = []
export const calls: ApiCall[] = []

/** A path like `/api/books/:bookId` matches any one segment where the `:name` is. */
function toPattern(path: string) {
  return new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+').replace(/\*/g, '.*')}$`)
}

/**
 * Answers `METHOD /path` with the handler's result: a plain value is a 200 JSON body,
 * `{ status, body }` sets the status, and a Response is returned as is. Later routes win.
 */
export function route(spec: string, handler: Handler | object) {
  const [method, path] = spec.split(' ') as [string, string]
  routes.unshift({
    method,
    pattern: toPattern(path),
    handler: typeof handler === 'function' ? (handler as Handler) : () => handler,
  })
}

/** `{ status, body }` from a handler, so a plain object body is never mistaken for one. */
export const reply = (status: number, body?: unknown) => ({ __reply: true, status, body })

export function resetApi() {
  routes.length = 0
  calls.length = 0
}

export const callsTo = (spec: string) => {
  const [method, path] = spec.split(' ') as [string, string]
  const pattern = toPattern(path)
  return calls.filter((c) => c.method === method && pattern.test(c.path))
}

async function readBody(request: Request) {
  const text = await request.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init)
  const url = new URL(request.url, location.href)
  const call: ApiCall = {
    method: request.method,
    path: url.pathname,
    query: url.searchParams,
    body: await readBody(request),
  }
  calls.push(call)
  const match = routes.find((r) => r.method === call.method && r.pattern.test(call.path))
  if (!match)
    return json(404, { error: 'not_found', message: `No route for ${call.method} ${call.path}` })
  const result = await match.handler(call)
  if (result instanceof Response) return result
  if (result && typeof result === 'object' && '__reply' in result) {
    const r = result as unknown as { status: number; body?: unknown }
    return json(r.status, r.body)
  }
  return json(200, result ?? {})
}

function json(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

vi.stubGlobal('fetch', vi.fn(fakeFetch))
