import { describe, expect, it } from 'vitest'
import { waveformBars } from './waveform'

describe('waveformBars', () => {
  it('draws the same shape for the same File', () => {
    expect(waveformBars('file-1', 48)).toEqual(waveformBars('file-1', 48))
  })

  it('draws another shape for another File', () => {
    expect(waveformBars('file-1', 48)).not.toEqual(waveformBars('file-2', 48))
  })

  it('keeps every bar visible and inside the box', () => {
    const bars = waveformBars('file-1', 200)
    expect(bars).toHaveLength(200)
    for (const h of bars) {
      expect(h).toBeGreaterThanOrEqual(24)
      expect(h).toBeLessThanOrEqual(100)
    }
  })
})
