import { describe, expect, it } from 'vitest'
import { compareHlc, decodeHlc, HlcClock } from './hlc.ts'

describe('HlcClock', () => {
  it('orders successive ticks even when the wall clock stands still', () => {
    const clock = new HlcClock('a', () => 1000)
    const first = clock.tick()
    const second = clock.tick()
    expect(compareHlc(first, second)).toBe(-1)
  })

  it('never goes backwards when the wall clock does', () => {
    let now = 5000
    const clock = new HlcClock('a', () => now)
    const before = clock.tick()
    now = 1000
    expect(compareHlc(before, clock.tick())).toBe(-1)
  })

  it('sorts a local change after a remote one from a device whose clock runs fast', () => {
    const fast = new HlcClock('fast', () => 9_000_000)
    const slow = new HlcClock('slow', () => 1_000)
    const remote = fast.tick()
    slow.receive(remote)
    expect(compareHlc(remote, slow.tick())).toBe(-1)
  })

  it('round-trips through the string encoding', () => {
    const clock = new HlcClock('node-1', () => 1_700_000_000_000)
    expect(decodeHlc(clock.tick())).toEqual({ wall: 1_700_000_000_000, counter: 0, node: 'node-1' })
  })
})
