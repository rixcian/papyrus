import type { TranslateTarget } from '@papyrus/shared'

export class TranslateError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface Translation {
  text: string
  /** DeepL's code for the language it detected, e.g. `EN`. */
  detectedSource: string | null
}

const TIMEOUT_MS = 10_000
const CACHE_SIZE = 500

/** Free-plan keys end in `:fx` and live on a separate host. */
export function deeplBaseUrl(apiKey: string): string {
  return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
}

/**
 * DeepL behind the server, so the API key never reaches a browser. Recent results are
 * remembered, because selecting the same words again shouldn't spend quota.
 */
export class DeepL {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly cache = new Map<string, Translation>()

  constructor(
    apiKey: string,
    baseUrl = deeplBaseUrl(apiKey),
    fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetchImpl = fetchImpl
  }

  async translate(text: string, target: TranslateTarget): Promise<Translation> {
    const cacheKey = `${target}\u0000${text}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      // Refresh its place, so the cache drops the least recently used first.
      this.cache.delete(cacheKey)
      this.cache.set(cacheKey, cached)
      return cached
    }

    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v2/translate`, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: [text], target_lang: target }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      throw new TranslateError(502, `Couldn’t reach DeepL: ${(error as Error).message}`)
    }
    if (!res.ok) throw new TranslateError(502, failure(res.status))

    const body = (await res.json()) as {
      translations?: { text?: string; detected_source_language?: string }[]
    }
    const first = body.translations?.[0]
    if (typeof first?.text !== 'string') throw new TranslateError(502, 'DeepL sent no translation')
    const result = { text: first.text, detectedSource: first.detected_source_language ?? null }
    this.cache.set(cacheKey, result)
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value as string)
    return result
  }
}

function failure(status: number): string {
  if (status === 403) return 'DeepL refused the API key; check PAPYRUS_DEEPL_API_KEY'
  if (status === 456) return 'The DeepL quota for this month is used up'
  if (status === 429) return 'DeepL is busy; try again in a moment'
  return `DeepL answered ${status}`
}
