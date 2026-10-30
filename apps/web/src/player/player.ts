import { syncEngine } from '@/sync'
import {
  audioLocation,
  chapterAt,
  locate,
  nextChapterStart,
  previousChapterStart,
  type TimelineChapter,
  trackStarts,
} from './timeline'

/** What the Player needs to know about the Audio File it plays. */
export interface PlayerItem {
  profileId: string
  fileId: string
  bookId: string
  title: string
  authors: string[]
  coverUrl: string | null
  duration: number
  tracks: { url: string; duration: number; title: string | null }[]
  chapters: TimelineChapter[]
}

export type SleepTimer =
  | { kind: 'minutes'; endsAt: number; minutes: number }
  | { kind: 'chapter'; chapter: number }

export interface PlayerState {
  item: PlayerItem | null
  playing: boolean
  /** Seconds into the whole Audio File. */
  time: number
  speed: number
  sleep: SleepTimer | null
  waiting: boolean
  error: string | null
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
export const SKIP_BACK = 15
export const SKIP_FORWARD = 30
const SAVE_EVERY_MS = 10_000
const FADE_S = 10
const SLEEP_REWIND_WITHIN_MS = 5 * 60 * 1000
const SLEEP_REWIND_S = 10

const speedKey = (profileId: string) => `papyrus:player:speed:${profileId}`

export function savedSpeed(profileId: string): number {
  const v = Number(localStorage.getItem(speedKey(profileId)))
  return v >= 0.5 && v <= 3 ? v : 1
}

/**
 * Plays one Audio File at a time through a single `<audio>` element, keeping a timeline
 * across its Tracks. Lives outside the routes, so it keeps playing while the app navigates
 * (spec: Player). Reading Progress goes through the sync outbox like the reader's.
 */
export class Player {
  private readonly audio: HTMLAudioElement
  private state: PlayerState = {
    item: null,
    playing: false,
    time: 0,
    speed: 1,
    sleep: null,
    waiting: false,
    error: null,
  }
  private readonly listeners = new Set<() => void>()
  private starts: number[] = []
  private index = -1
  /** Offset to seek to once the next Track's metadata is in. */
  private pendingOffset: number | null = null
  private wantPlay = false
  private lastSaved = 0
  private sleptAt = 0
  /** Nothing is saved until the starting position is in place (see the reader's `ready`). */
  private ready = false
  private chapter = -1

  constructor(audio: HTMLAudioElement) {
    this.audio = audio
    audio.preload = 'auto'
    audio.addEventListener('loadedmetadata', this.onLoaded)
    audio.addEventListener('timeupdate', this.onTime)
    audio.addEventListener('ended', this.onEnded)
    audio.addEventListener('play', this.onPlayState)
    audio.addEventListener('pause', this.onPlayState)
    audio.addEventListener('waiting', () => this.set({ waiting: true }))
    audio.addEventListener('playing', () => this.set({ waiting: false }))
    audio.addEventListener('canplay', () => this.set({ waiting: false }))
    audio.addEventListener('error', this.onError)
    window.addEventListener('pagehide', () => this.save())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save()
    })
    this.setUpMediaSession()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = () => this.state

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  /** Opens an Audio File at a time; plays only when asked, since browsers want a tap. */
  load(item: PlayerItem, start: number, play = false) {
    if (this.state.item) this.save()
    this.ready = false
    this.index = -1
    this.starts = trackStarts(item.tracks)
    this.chapter = -1
    this.sleptAt = 0
    this.set({
      item,
      time: start,
      speed: savedSpeed(item.profileId),
      sleep: null,
      error: null,
      playing: false,
    })
    this.updateMetadata()
    this.wantPlay = play
    this.goTo(start)
  }

  close() {
    this.save()
    this.wantPlay = false
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.index = -1
    this.set({ item: null, playing: false, sleep: null, error: null, waiting: false })
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
  }

  play() {
    const { item } = this.state
    if (!item) return
    if (this.sleptAt && Date.now() - this.sleptAt < SLEEP_REWIND_WITHIN_MS)
      this.goTo(this.state.time - SLEEP_REWIND_S)
    this.sleptAt = 0
    if (this.state.time >= item.duration - 0.5) this.goTo(0)
    this.wantPlay = true
    // Show the intent at once; a Track that is still loading starts a moment later.
    this.set({ playing: true })
    // The first play marks the Book as being read, as opening a text File does.
    this.save()
    this.audio.volume = 1
    this.audio.playbackRate = this.state.speed
    void this.audio.play().catch((e: Error) => {
      if (e.name !== 'AbortError') this.set({ error: e.message })
    })
  }

  pause() {
    this.wantPlay = false
    this.audio.pause()
    this.set({ playing: false })
    this.save()
  }

  toggle() {
    if (this.state.playing || this.wantPlay) this.pause()
    else this.play()
  }

  seek(time: number) {
    this.goTo(time)
    this.save()
  }

  skip(delta: number) {
    this.seek(this.state.time + delta)
  }

  previousChapter() {
    const { item } = this.state
    if (!item) return
    this.seek(item.chapters.length ? previousChapterStart(item.chapters, this.state.time) : 0)
  }

  nextChapter() {
    const { item } = this.state
    if (!item) return
    const next = nextChapterStart(item.chapters, this.state.time)
    if (next !== undefined) this.seek(next)
  }

  setSpeed(speed: number) {
    const { item } = this.state
    this.audio.playbackRate = speed
    if (item) localStorage.setItem(speedKey(item.profileId), String(speed))
    this.set({ speed })
    this.updatePosition()
  }

  setSleep(sleep: { kind: 'minutes'; minutes: number } | { kind: 'chapter' } | null) {
    const { item } = this.state
    this.audio.volume = 1
    if (!sleep || !item) return this.set({ sleep: null })
    if (sleep.kind === 'minutes')
      this.set({
        sleep: {
          kind: 'minutes',
          minutes: sleep.minutes,
          endsAt: Date.now() + sleep.minutes * 60_000,
        },
      })
    else
      this.set({ sleep: { kind: 'chapter', chapter: chapterAt(item.chapters, this.state.time) } })
  }

  /** Writes the position now; the outbox decides when it reaches the server. */
  save() {
    const { item, time } = this.state
    if (!item || !this.ready || !item.duration) return
    this.lastSaved = Date.now()
    void syncEngine.record(item.profileId, {
      kind: 'progress',
      fileId: item.fileId,
      cfi: audioLocation(time),
      fraction: Math.min(1, time / item.duration),
    })
  }

  private goTo(time: number) {
    const { item } = this.state
    if (!item || !item.tracks.length) return
    const t = Math.min(Math.max(0, time), item.duration)
    const { index, offset } = locate(item.tracks, t)
    this.set({ time: t })
    if (index !== this.index) {
      this.index = index
      this.pendingOffset = offset
      this.audio.src = item.tracks[index]?.url ?? ''
      this.audio.playbackRate = this.state.speed
      this.set({ waiting: true })
    } else if (this.pendingOffset !== null) {
      this.pendingOffset = offset
    } else {
      this.audio.currentTime = offset
    }
    this.updatePosition()
  }

  private onLoaded = () => {
    if (this.pendingOffset !== null) {
      this.audio.currentTime = this.pendingOffset
      this.pendingOffset = null
    }
    this.audio.playbackRate = this.state.speed
    this.ready = true
    if (this.wantPlay)
      void this.audio.play().catch((e: Error) => {
        if (e.name !== 'AbortError') this.set({ error: e.message })
      })
    this.updatePosition()
  }

  private onTime = () => {
    const { item } = this.state
    if (!item || this.pendingOffset !== null || this.index < 0) return
    const time = (this.starts[this.index] ?? 0) + this.audio.currentTime
    this.set({ time })
    const chapter = chapterAt(item.chapters, time)
    if (chapter !== this.chapter) {
      this.chapter = chapter
      this.updateMetadata()
    }
    this.checkSleep(time)
    if (this.state.playing && Date.now() - this.lastSaved > SAVE_EVERY_MS) this.save()
  }

  private checkSleep(time: number) {
    const { sleep, item, speed } = this.state
    if (!sleep || !item) return
    let left: number
    if (sleep.kind === 'minutes') left = (sleep.endsAt - Date.now()) / 1000
    else {
      const end =
        item.chapters[sleep.chapter + 1]?.start ?? (sleep.chapter < 0 ? undefined : item.duration)
      if (end === undefined) return
      left = (end - time) / speed
    }
    if (left <= 0) {
      this.audio.volume = 1
      this.sleptAt = Date.now()
      this.set({ sleep: null })
      this.pause()
    } else if (left < FADE_S) this.audio.volume = Math.max(0, left / FADE_S)
    else if (this.audio.volume !== 1) this.audio.volume = 1
  }

  private onEnded = () => {
    const { item } = this.state
    if (!item) return
    if (this.index < item.tracks.length - 1) {
      this.wantPlay = true
      this.goTo(this.starts[this.index + 1] ?? 0)
      this.save()
    } else {
      this.wantPlay = false
      this.set({ time: item.duration, playing: false })
      if (this.state.sleep) this.set({ sleep: null })
      this.save()
    }
  }

  private onPlayState = () => {
    const playing = !this.audio.paused
    // A Track change pauses for a moment; it isn't a pause to the listener.
    if (!playing && this.wantPlay) return
    this.set({ playing })
    if ('mediaSession' in navigator)
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    this.updatePosition()
  }

  private onError = () => {
    const code = this.audio.error?.code
    if (!this.state.item || !this.audio.getAttribute('src')) return
    this.wantPlay = false
    this.set({
      playing: false,
      waiting: false,
      error:
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? "This device can't play this format."
          : code === MediaError.MEDIA_ERR_NETWORK
            ? 'The recording stopped loading. Check the connection.'
            : "Couldn't play this recording.",
    })
  }

  private updateMetadata() {
    const { item } = this.state
    if (!item || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    const chapter = item.chapters[chapterAt(item.chapters, this.state.time)]
    navigator.mediaSession.metadata = new MediaMetadata({
      title: chapter?.title ?? item.title,
      artist: item.authors.join(', '),
      album: item.title,
      artwork: item.coverUrl
        ? [{ src: new URL(item.coverUrl, location.origin).href, sizes: '512x512' }]
        : [],
    })
  }

  private updatePosition() {
    const { item, time, speed } = this.state
    if (!item || !('mediaSession' in navigator) || !item.duration) return
    try {
      navigator.mediaSession.setPositionState({
        duration: item.duration,
        position: Math.min(time, item.duration),
        playbackRate: speed,
      })
    } catch {
      // Some browsers reject a position state they consider out of range.
    }
  }

  private setUpMediaSession() {
    if (!('mediaSession' in navigator)) return
    const on = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // Not every browser knows every action.
      }
    }
    on('play', () => this.play())
    on('pause', () => this.pause())
    on('stop', () => this.pause())
    on('seekbackward', (d) => this.skip(-(d.seekOffset ?? SKIP_BACK)))
    on('seekforward', (d) => this.skip(d.seekOffset ?? SKIP_FORWARD))
    on('previoustrack', () => this.previousChapter())
    on('nexttrack', () => this.nextChapter())
    on('seekto', (d) => d.seekTime !== undefined && this.seek(d.seekTime))
  }
}
