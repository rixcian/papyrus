import { afterEach, describe, expect, it } from 'vitest'
import { createHarness, Device, type Harness } from '../test/harness.ts'
import { DeepL, deeplBaseUrl } from './deepl.ts'

function fakeDeepL(status = 200) {
  const calls: {
    url: string
    auth: string | null
    body: { text: string[]; target_lang: string }
  }[] = []
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body))
    calls.push({ url: String(input), auth: headers.get('authorization'), body })
    if (status !== 200) return new Response('', { status })
    return Response.json({
      translations: [
        { detected_source_language: 'EN', text: `[${body.target_lang}] ${body.text[0]}` },
      ],
    })
  }) as typeof fetch
  return { calls, deepl: new DeepL('secret:fx', 'https://deepl.test', fetchImpl) }
}

describe('DeepL', () => {
  it('picks the free host for free-plan keys', () => {
    expect(deeplBaseUrl('abc:fx')).toBe('https://api-free.deepl.com')
    expect(deeplBaseUrl('abc')).toBe('https://api.deepl.com')
  })

  it('translates with the key in a header, and remembers recent results', async () => {
    const { deepl, calls } = fakeDeepL()
    expect(await deepl.translate('The spice must flow', 'CS')).toEqual({
      text: '[CS] The spice must flow',
      detectedSource: 'EN',
    })
    await deepl.translate('The spice must flow', 'CS')
    await deepl.translate('The spice must flow', 'DE')
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      url: 'https://deepl.test/v2/translate',
      auth: 'DeepL-Auth-Key secret:fx',
      body: { text: ['The spice must flow'], target_lang: 'CS' },
    })
  })

  it('explains DeepL failures', async () => {
    await expect(fakeDeepL(456).deepl.translate('x', 'CS')).rejects.toThrow('quota')
    await expect(fakeDeepL(403).deepl.translate('x', 'CS')).rejects.toThrow('API key')
  })
})

describe('POST /api/translate', () => {
  let h: Harness
  afterEach(() => h?.close())

  async function device(deepl?: DeepL) {
    h = await createHarness({}, deepl ? { deepl } : {})
    const d = new Device(h.app)
    await d.createProfile('Alice')
    return d
  }
  const translate = (d: Device, payload: Record<string, unknown>) =>
    d.request({ method: 'POST', url: '/api/translate', payload })

  it('is off without a DeepL key', async () => {
    const d = await device()
    expect((await d.request({ url: '/api/translate/status' })).json()).toEqual({ enabled: false })
    const res = await translate(d, { text: 'hello', target: 'CS' })
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toBe('translation_off')
  })

  it('translates a selection into a supported language', async () => {
    const d = await device(fakeDeepL().deepl)
    expect((await d.request({ url: '/api/translate/status' })).json()).toEqual({ enabled: true })
    expect((await translate(d, { text: '  hello ', target: 'CS' })).json()).toEqual({
      text: '[CS] hello',
      detectedSource: 'EN',
    })
    expect((await translate(d, { text: 'hello', target: 'XX' })).statusCode).toBe(400)
    expect((await translate(d, { text: '   ', target: 'CS' })).statusCode).toBe(400)
    expect((await translate(d, { text: 'x'.repeat(5001), target: 'CS' })).statusCode).toBe(400)
  })

  it('passes DeepL failures on as 502', async () => {
    const d = await device(fakeDeepL(456).deepl)
    const res = await translate(d, { text: 'hello', target: 'CS' })
    expect(res.statusCode).toBe(502)
    expect(res.json().message).toContain('quota')
  })

  it('needs an Active Profile', async () => {
    await device(fakeDeepL().deepl)
    const stranger = new Device(h.app)
    expect((await translate(stranger, { text: 'hello', target: 'CS' })).statusCode).toBe(401)
  })
})
