import { decodeHlc, isHlc } from '@papyrus/shared'

/** Seconds across the whole Audio File; Tracks are laid end to end (spec: Player). */
export interface TimelineTrack {
  duration: number
}

export interface TimelineChapter {
  title: string
  start: number
}

export function trackStarts(tracks: TimelineTrack[]): number[] {
  const starts: number[] = []
  let at = 0
  for (const t of tracks) {
    starts.push(at)
    at += t.duration
  }
  return starts
}

/** Which Track a time falls in, and how far into it; the end belongs to the last Track. */
export function locate(tracks: TimelineTrack[], time: number): { index: number; offset: number } {
  const starts = trackStarts(tracks)
  for (let i = tracks.length - 1; i >= 0; i--) {
    const start = starts[i] as number
    if (time >= start || i === 0) return { index: i, offset: Math.max(0, time - start) }
  }
  return { index: 0, offset: 0 }
}

/** The Chapter playing at a time; -1 before the first or when there are none. */
export function chapterAt(chapters: TimelineChapter[], time: number): number {
  let found = -1
  for (let i = 0; i < chapters.length; i++) {
    if ((chapters[i] as TimelineChapter).start <= time + 0.05) found = i
    else break
  }
  return found
}

/**
 * Previous Chapter goes to the start of the current one first, unless that is only a
 * moment ago, like a CD player.
 */
export function previousChapterStart(chapters: TimelineChapter[], time: number): number {
  const i = chapterAt(chapters, time)
  if (i < 0) return 0
  const current = (chapters[i] as TimelineChapter).start
  if (time - current > 3 || i === 0) return current
  return (chapters[i - 1] as TimelineChapter).start
}

export function nextChapterStart(chapters: TimelineChapter[], time: number): number | undefined {
  return chapters[chapterAt(chapters, time) + 1]?.start
}

/** `1:02:03`, or `2:03` under an hour. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** `11 h 20 m`, `45 m`, or `under a minute`. */
export function formatLength(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 1) return 'under a minute'
  const h = Math.floor(m / 60)
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} m` : `${m} m`
}

/** Audio Reading Progress lives in the same location string as a CFI: `t:<seconds>`. */
export const audioLocation = (time: number) => `t:${Math.max(0, time).toFixed(1)}`

export function parseAudioLocation(location: string | undefined | null): number | undefined {
  const m = /^t:(\d+(?:\.\d+)?)$/.exec(location ?? '')
  return m ? Number(m[1]) : undefined
}

const LONG_BREAK_MS = 10 * 60 * 1000
const RESUME_REWIND_S = 5

/** Coming back after a long break replays a few seconds, so the sentence isn't cut. */
export function resumeTime(saved: number, hlc: string | undefined, now = Date.now()): number {
  if (!hlc || !isHlc(hlc)) return saved
  return now - decodeHlc(hlc).wall > LONG_BREAK_MS ? Math.max(0, saved - RESUME_REWIND_S) : saved
}
