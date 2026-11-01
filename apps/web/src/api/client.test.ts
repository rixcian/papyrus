import { describe, expect, it } from 'vitest'
import { route } from '@/test/api'
import { ApiError, api, unwrap } from './client'

describe('unwrap', () => {
  it('returns the body of a successful call', async () => {
    route('GET /api/session', { profile: null })
    expect(await unwrap(api.GET('/api/session'))).toEqual({ profile: null })
  })

  it('turns an error body into an ApiError', async () => {
    route(
      'GET /api/session',
      () => new Response(JSON.stringify({ error: 'nope', message: 'No' }), { status: 409 }),
    )
    const error = await unwrap(api.GET('/api/session')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'nope', message: 'No' })
  })

  it('names the status when the body says nothing', async () => {
    route('GET /api/session', () => new Response(null, { status: 500 }))
    await expect(unwrap(api.GET('/api/session'))).rejects.toMatchObject({
      status: 500,
      code: 'unknown',
      message: 'Request failed (500)',
    })
  })
})
