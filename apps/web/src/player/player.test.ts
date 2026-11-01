import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncEngine } from '@/sync'
import { FakeAudio, playerItem } from '@/test/audio'
import { Player, savedSpeed } from './player'

type Handler = (details: { seekOffset?: number; seekTime?: number }) => void

function setup() {
  const audio = new FakeAudio()
  const player = new Player(audio as unknown as HTMLAudioElement)
  const record = vi.spyOn(syncEngine, 'record').mockResolvedValue({} as never)
  return { audio, player, record }
}

const lastFraction = (record: ReturnType<typeof setup>['record']) =>
  (record.mock.calls.at(-1)?.[1] as { fraction: number } | undefined)?.fraction

describe('Player', () => {
  let handlers: Map<string, Handler>
  let session: {
    metadata: unknown
    playbackState: string
    setActionHandler: unknown
    setPositionState: unknown
  }

  beforeEach(() => {
    handlers = new Map()
    session = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn((action: string, handler: Handler) => {
        if (action === 'stop') throw new Error('unknown action')
        handlers.set(action, handler)
      }),
      setPositionState: vi.fn((state: { position: number; duration: number }) => {
        if (state.position > state.duration) throw new Error('out of range')
      }),
    }
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true })
    vi.stubGlobal(
      'MediaMetadata',
      class {
        readonly init: unknown
        constructor(init: unknown) {
          this.init = init
        }
      },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('opens an Audio File at a position across its Tracks', () => {
    const { audio, player } = setup()
    player.load(playerItem(), 150)
    expect(audio.src).toBe('/t/2.mp3')
    expect(player.getState()).toMatchObject({ time: 150, waiting: true, playing: false })
    audio.loaded()
    expect(audio.currentTime).toBe(50)
    expect((session.metadata as { init: { title: string } }).init.title).toBe('Lighthouse')
    expect(audio.play).not.toHaveBeenCalled()
  })

  it('plays when asked on load, and reports the time across Tracks', () => {
    const { audio, player, record } = setup()
    const listener = vi.fn()
    const unsubscribe = player.subscribe(listener)
    player.load(playerItem(), 0, true)
    audio.loaded()
    expect(audio.play).toHaveBeenCalled()
    audio.at(30)
    expect(player.getState().time).toBe(30)
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    audio.fire('waiting')
    expect(player.getState().waiting).toBe(true)
    audio.fire('playing')
    audio.fire('canplay')
    expect(player.getState().waiting).toBe(false)
    expect(record).toHaveBeenCalled()
  })

  it('toggles play and pause, saving progress', () => {
    const { audio, player, record } = setup()
    player.load(playerItem(), 30)
    audio.loaded()
    player.toggle()
    expect(player.getState().playing).toBe(true)
    expect(session.playbackState).toBe('playing')
    expect(lastFraction(record)).toBeCloseTo(0.1)
    player.toggle()
    expect(player.getState().playing).toBe(false)
    expect(audio.pause).toHaveBeenCalled()
    expect(session.playbackState).toBe('paused')
  })

  it('starts over when played at the end', () => {
    const { audio, player } = setup()
    player.load(playerItem(), 300)
    audio.loaded()
    player.play()
    expect(audio.src).toBe('/t/1.mp3')
    expect(player.getState().time).toBe(0)
  })

  it('seeks, skips and moves between Chapters', () => {
    const { audio, player } = setup()
    player.load(playerItem(), 10)
    audio.loaded()
    player.skip(30)
    expect(audio.currentTime).toBe(40)
    player.nextChapter()
    expect(player.getState().time).toBe(100)
    expect(audio.src).toBe('/t/2.mp3')
    // Still loading the new Track: a further seek just moves where it lands.
    player.seek(120)
    audio.loaded()
    expect(audio.currentTime).toBe(20)
    player.previousChapter()
    expect(player.getState().time).toBe(100)
    player.seek(260)
    player.nextChapter()
    expect(player.getState().time).toBe(260)
    player.seek(-5)
    expect(player.getState().time).toBe(0)
  })

  it('goes to the start for previous with no Chapters', () => {
    const { audio, player } = setup()
    player.load(playerItem({ chapters: [] }), 50)
    audio.loaded()
    player.previousChapter()
    expect(player.getState().time).toBe(0)
  })

  it('remembers the speed per Profile', () => {
    const { audio, player } = setup()
    expect(savedSpeed('p-player')).toBe(1)
    player.load(playerItem(), 0)
    player.setSpeed(1.5)
    expect(audio.playbackRate).toBe(1.5)
    expect(savedSpeed('p-player')).toBe(1.5)
    localStorage.setItem('papyrus:player:speed:p-x', '9')
    expect(savedSpeed('p-x')).toBe(1)
  })

  it('moves on to the next Track, and stops at the end', () => {
    const { audio, player } = setup()
    player.load(playerItem(), 90, true)
    audio.loaded()
    audio.fire('ended')
    expect(audio.src).toBe('/t/2.mp3')
    // The Track change pauses the element; that isn't a pause to the listener.
    audio.pause()
    expect(player.getState().playing).toBe(true)
    audio.loaded()
    player.setSleep({ kind: 'chapter' })
    audio.fire('ended')
    expect(player.getState()).toMatchObject({ time: 300, playing: false, sleep: null })
  })

  it('sleeps after a number of minutes, fading out, and rewinds a little on resume', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { audio, player } = setup()
    player.load(playerItem(), 0)
    audio.loaded()
    player.play()
    player.setSleep({ kind: 'minutes', minutes: 1 })
    expect(player.getState().sleep).toMatchObject({ kind: 'minutes', minutes: 1 })
    vi.setSystemTime(Date.now() + 55_000)
    audio.at(55)
    expect(audio.volume).toBeCloseTo(0.5)
    vi.setSystemTime(Date.now() + 10_000)
    audio.at(65)
    expect(player.getState()).toMatchObject({ playing: false, sleep: null })
    player.play()
    expect(player.getState().time).toBe(55)
  })

  it('sleeps at the end of the Chapter, and restores the volume when it is far off', () => {
    const { audio, player } = setup()
    player.load(playerItem(), 0)
    audio.loaded()
    player.play()
    player.setSleep({ kind: 'chapter' })
    audio.volume = 0.3
    audio.at(50)
    expect(audio.volume).toBe(1)
    audio.at(99)
    expect(audio.volume).toBeLessThan(1)
    audio.at(100)
    expect(player.getState()).toMatchObject({ playing: false, sleep: null })
    player.setSleep(null)
  })

  it('ignores a Chapter sleep timer before the first Chapter', () => {
    const { audio, player } = setup()
    player.load(playerItem({ chapters: [{ title: 'Late', start: 50 }] }), 0)
    audio.loaded()
    player.setSleep({ kind: 'chapter' })
    audio.at(10)
    expect(player.getState().sleep).toMatchObject({ chapter: -1 })
  })

  it('does nothing without an Audio File', () => {
    const { player, record } = setup()
    player.play()
    player.previousChapter()
    player.nextChapter()
    player.setSleep({ kind: 'chapter' })
    player.setSpeed(2)
    player.seek(10)
    expect(player.getState().item).toBeNull()
    expect(record).not.toHaveBeenCalled()
  })

  it('explains playback errors', () => {
    const { audio, player } = setup()
    audio.error = { code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED }
    audio.fire('error')
    player.load(playerItem(), 0)
    audio.fire('error')
    expect(player.getState().error).toBe("This device can't play this format.")
    audio.error = { code: MediaError.MEDIA_ERR_NETWORK }
    audio.fire('error')
    expect(player.getState().error).toMatch(/stopped loading/)
    audio.error = null
    audio.fire('error')
    expect(player.getState().error).toBe("Couldn't play this recording.")
  })

  it('shows a refused play, but not an interrupted one', async () => {
    const { audio, player } = setup()
    player.load(playerItem(), 0)
    audio.loaded()
    audio.playResult = () =>
      Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    player.play()
    await Promise.resolve()
    expect(player.getState().error).toBeNull()
    audio.playResult = () => Promise.reject(new Error('Not allowed'))
    player.pause()
    player.play()
    await vi.waitFor(() => expect(player.getState().error).toBe('Not allowed'))
    player.load(playerItem(), 0, true)
    audio.loaded()
    await vi.waitFor(() => expect(player.getState().error).toBe('Not allowed'))
  })

  it('closes, saving where it was and clearing the lock screen', () => {
    const { audio, player, record } = setup()
    player.load(playerItem({ coverUrl: null }), 60)
    audio.loaded()
    player.close()
    expect(record).toHaveBeenCalled()
    expect(audio.getAttribute('src')).toBeNull()
    expect(player.getState().item).toBeNull()
    expect(session.metadata).toBeNull()
  })

  it('saves the old position before opening another Audio File', () => {
    const { audio, player, record } = setup()
    player.load(playerItem(), 60)
    audio.loaded()
    player.load(playerItem({ fileId: 'a2' }), 0)
    expect(record.mock.calls.at(-1)?.[1]).toMatchObject({ fileId: 'a1' })
  })

  it('saves when the page is hidden or left, and drives the lock screen controls', () => {
    const { audio, player, record } = setup()
    const detach = player.attach()
    player.load(playerItem(), 60)
    audio.loaded()
    record.mockClear()
    window.dispatchEvent(new Event('pagehide'))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(record).toHaveBeenCalledTimes(2)

    handlers.get('play')?.({})
    expect(player.getState().playing).toBe(true)
    handlers.get('pause')?.({})
    expect(player.getState().playing).toBe(false)
    handlers.get('seekforward')?.({})
    expect(player.getState().time).toBe(90)
    handlers.get('seekbackward')?.({ seekOffset: 5 })
    expect(player.getState().time).toBe(85)
    handlers.get('seekforward')?.({ seekOffset: 5 })
    handlers.get('seekbackward')?.({})
    expect(player.getState().time).toBe(75)
    handlers.get('nexttrack')?.({})
    expect(player.getState().time).toBe(100)
    // Only a moment into a Chapter, previous goes to the one before, like a CD player.
    handlers.get('previoustrack')?.({})
    expect(player.getState().time).toBe(0)
    handlers.get('seekto')?.({ seekTime: 10 })
    handlers.get('seekto')?.({})
    expect(player.getState().time).toBe(10)

    detach()
    expect(player.getState().item).toBeNull()
  })

  it('does not save before the starting position is in place, or for an empty File', () => {
    const { player, record } = setup()
    player.load(playerItem(), 60)
    player.save()
    player.load(playerItem({ duration: 0, tracks: [] }), 0)
    player.save()
    expect(record).not.toHaveBeenCalled()
  })
})
