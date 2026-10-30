import { afterEach, describe, expect, it } from 'vitest'
import { createHarness, type Harness } from './test/harness.ts'

let h: Harness
afterEach(() => h?.close())

describe('app', () => {
  it('answers the health check with security headers', async () => {
    h = await createHarness()
    const res = await h.app.inject({ url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    expect(res.headers['content-security-policy']).toContain("script-src 'self'")
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('returns JSON 404s for unknown API routes', async () => {
    h = await createHarness()
    const res = await h.app.inject({ url: '/api/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('not_found')
  })

  it('serves an OpenAPI document', async () => {
    h = await createHarness()
    const res = await h.app.inject({ url: '/api/openapi.json' })
    expect(res.json().paths['/api/profiles']).toBeDefined()
  })
})
