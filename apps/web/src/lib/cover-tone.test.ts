import { describe, expect, it } from 'vitest'
import { coverTone, liftTone } from './cover-tone'

const pixels = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat())

describe('coverTone', () => {
  it('reads a single-colour cover as that colour', () => {
    expect(coverTone(pixels([200, 40, 40, 255], [200, 40, 40, 255]))).toEqual([200, 40, 40])
  })

  it('leans towards the vivid colour over a white border', () => {
    const [r, g, b] = coverTone(
      pixels([255, 255, 255, 255], [255, 255, 255, 255], [30, 90, 220, 255]),
    ) ?? [0, 0, 0]
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
  })

  it('skips transparent pixels', () => {
    expect(coverTone(pixels([0, 0, 0, 0], [40, 200, 90, 255]))).toEqual([40, 200, 90])
  })

  it('has no tone when nothing is opaque', () => {
    expect(coverTone(pixels([10, 10, 10, 0]))).toBeNull()
  })
})

describe('liftTone', () => {
  it('brightens a dark tone and keeps its hue', () => {
    expect(liftTone([50, 25, 0])).toEqual([150, 75, 0])
  })

  it('leaves a bright tone alone', () => {
    expect(liftTone([220, 100, 40])).toEqual([220, 100, 40])
  })

  it('turns black into a neutral grey', () => {
    expect(liftTone([0, 0, 0])).toEqual([150, 150, 150])
  })
})
