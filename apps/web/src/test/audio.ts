import { vi } from 'vitest'
import type { PlayerItem } from '@/player/player'

/** Enough of an `<audio>` element for the Player: tests fire its events by hand. */
export class FakeAudio extends EventTarget {
  preload = ''
  currentTime = 0
  volume = 1
  playbackRate = 1
  paused = true
  error: { code: number } | null = null
  private attrs = new Map<string, string>()
  playResult: () => Promise<void> = async () => {}
  play = vi.fn(() => {
    this.paused = false
    this.fire('play')
    return this.playResult()
  })
  pause = vi.fn(() => {
    this.paused = true
    this.fire('pause')
  })
  load = vi.fn()

  get src() {
    return this.attrs.get('src') ?? ''
  }
  set src(value: string) {
    this.attrs.set('src', value)
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }
  removeAttribute(name: string) {
    this.attrs.delete(name)
  }
  fire(type: string) {
    this.dispatchEvent(new Event(type))
  }
  /** The current Track's metadata arrived. */
  loaded() {
    this.fire('loadedmetadata')
  }
  at(seconds: number) {
    this.currentTime = seconds
    this.fire('timeupdate')
  }
}

export function playerItem(overrides: Partial<PlayerItem> = {}): PlayerItem {
  return {
    profileId: 'p-player',
    fileId: 'a1',
    bookId: 'b1',
    title: 'Quiet Shore',
    authors: ['Ann Author'],
    coverUrl: '/api/books/b1/cover',
    duration: 300,
    tracks: [
      { url: '/t/1.mp3', duration: 100, title: 'One' },
      { url: '/t/2.mp3', duration: 200, title: 'Two' },
    ],
    chapters: [
      { title: 'Arrival', start: 0 },
      { title: 'Lighthouse', start: 100 },
      { title: 'Departure', start: 250 },
    ],
    ...overrides,
  }
}
