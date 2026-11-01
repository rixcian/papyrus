/**
 * Bar heights for the player's waveform, as percentages. They're drawn, not measured: a
 * steady shape per Audio File so the scrubber looks the same each visit.
 */
export function waveformBars(seed: string, count: number): number[] {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619)
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) ^ Math.imul(state, 3266489909)
    return ((state >>> 0) % 1000) / 1000
  }
  return Array.from({ length: count }, (_, i) => {
    const swell = (Math.sin(i * 0.42) + 1) / 2
    return Math.round(24 + swell * 36 + next() * 40)
  })
}
