/**
 * Hybrid logical clock timestamps (see ADR 0002).
 *
 * Encoded as `<wall ms, 13 digits>-<counter, 4 hex>-<node>` so that plain string
 * comparison orders them. Last write wins compares these strings.
 */

export type Hlc = string

const COUNTER_MAX = 0xffff

export interface HlcParts {
  wall: number
  counter: number
  node: string
}

export function encodeHlc({ wall, counter, node }: HlcParts): Hlc {
  return `${String(wall).padStart(13, '0')}-${counter.toString(16).padStart(4, '0')}-${node}`
}

export function decodeHlc(hlc: Hlc): HlcParts {
  const match = /^(\d{13})-([0-9a-f]{4})-(.+)$/.exec(hlc)
  if (!match) throw new Error(`Invalid HLC: ${hlc}`)
  return {
    wall: Number(match[1]),
    counter: Number.parseInt(match[2] as string, 16),
    node: match[3] as string,
  }
}

export function isHlc(value: string): boolean {
  return /^\d{13}-[0-9a-f]{4}-.+$/.test(value)
}

export function compareHlc(a: Hlc, b: Hlc): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export class HlcClock {
  readonly node: string
  private readonly now: () => number
  private last: HlcParts

  constructor(node: string, now: () => number = Date.now) {
    this.node = node
    this.now = now
    this.last = { wall: 0, counter: 0, node }
  }

  /** A timestamp for a local change, later than everything this clock has seen. */
  tick(): Hlc {
    const wall = Math.max(this.now(), this.last.wall)
    const counter = wall === this.last.wall ? this.last.counter + 1 : 0
    this.last = this.bump(wall, counter)
    return encodeHlc(this.last)
  }

  /** Folds in a timestamp seen from another device, so later local ticks sort after it. */
  receive(remote: Hlc): void {
    const r = decodeHlc(remote)
    const now = this.now()
    const wall = Math.max(now, this.last.wall, r.wall)
    let counter: number
    if (wall === this.last.wall && wall === r.wall) counter = Math.max(this.last.counter, r.counter)
    else if (wall === this.last.wall) counter = this.last.counter
    else if (wall === r.wall) counter = r.counter
    else counter = -1
    this.last = this.bump(wall, counter)
  }

  private bump(wall: number, counter: number): HlcParts {
    if (counter > COUNTER_MAX) return { wall: wall + 1, counter: 0, node: this.node }
    return { wall, counter: Math.max(counter, 0), node: this.node }
  }
}
