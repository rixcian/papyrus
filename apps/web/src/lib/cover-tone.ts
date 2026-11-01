import { useEffect, useState } from 'react'

/** A colour as red, green and blue, each 0–255. */
export type Rgb = [number, number, number]

/**
 * The colour a cover reads as: the average of its pixels, weighted towards vivid ones so a
 * white border or black lettering doesn't wash the tone out. Transparent pixels don't count.
 */
export function coverTone(pixels: Uint8ClampedArray): Rgb | null {
  let r = 0
  let g = 0
  let b = 0
  let total = 0
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) < 128) continue
    const pr = pixels[i] ?? 0
    const pg = pixels[i + 1] ?? 0
    const pb = pixels[i + 2] ?? 0
    const max = Math.max(pr, pg, pb)
    const min = Math.min(pr, pg, pb)
    const saturation = max === 0 ? 0 : (max - min) / max
    const weight = 0.1 + saturation * (max / 255)
    r += pr * weight
    g += pg * weight
    b += pb * weight
    total += weight
  }
  if (!total) return null
  return liftTone([Math.round(r / total), Math.round(g / total), Math.round(b / total)])
}

/** Dark tones vanish on the Night background; brighten them, keeping the hue. */
export function liftTone(tone: Rgb, floor = 150): Rgb {
  const max = Math.max(...tone)
  if (max >= floor) return tone
  if (max === 0) return [floor, floor, floor]
  const k = floor / max
  return tone.map((c) => Math.min(255, Math.round(c * k))) as Rgb
}

const SAMPLE = 16
const tones = new Map<string, Promise<Rgb | null>>()

function sample(url: string): Promise<Rgb | null> {
  let tone = tones.get(url)
  if (!tone) {
    tone = (async () => {
      const img = new Image()
      img.src = url
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = SAMPLE
      canvas.height = SAMPLE
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)
      return coverTone(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data)
    })().catch(() => null)
    tones.set(url, tone)
  }
  return tone
}

/** The tone of a cover image, worked out once per URL; null until known, or with no cover. */
export function useCoverTone(coverUrl: string | null | undefined): Rgb | null {
  const [tone, setTone] = useState<{ url: string; rgb: Rgb | null } | null>(null)
  useEffect(() => {
    if (!coverUrl) return
    let live = true
    void sample(coverUrl).then((rgb) => live && setTone({ url: coverUrl, rgb }))
    return () => {
      live = false
    }
  }, [coverUrl])
  return tone && tone.url === coverUrl ? tone.rgb : null
}

/** `rgb(…)` with an alpha, for gradients. */
export const rgba = (tone: Rgb, alpha: number) => `rgb(${tone.join(' ')} / ${alpha})`
