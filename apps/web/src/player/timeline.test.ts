import { encodeHlc } from '@papyrus/shared'
import { describe, expect, it } from 'vitest'
import {
  audioLocation,
  chapterAt,
  chapterSpan,
  formatClock,
  formatLength,
  locate,
  nextChapterStart,
  parseAudioLocation,
  previousChapterStart,
  resumeTime,
} from './timeline'

const tracks = [{ duration: 10 }, { duration: 20 }, { duration: 5 }]
const chapters = [
  { title: 'One', start: 0 },
  { title: 'Two', start: 10 },
  { title: 'Three', start: 30 },
]

describe('the audio timeline', () => {
  it('maps a time to a Track and an offset in it', () => {
    expect(locate(tracks, 0)).toEqual({ index: 0, offset: 0 })
    expect(locate(tracks, 9.5)).toEqual({ index: 0, offset: 9.5 })
    expect(locate(tracks, 10)).toEqual({ index: 1, offset: 0 })
    expect(locate(tracks, 33)).toEqual({ index: 2, offset: 3 })
    expect(locate(tracks, 99)).toEqual({ index: 2, offset: 69 })
  })

  it('finds Chapters and steps between them', () => {
    expect(chapterAt(chapters, 12)).toBe(1)
    expect(chapterAt([], 12)).toBe(-1)
    expect(nextChapterStart(chapters, 12)).toBe(30)
    expect(nextChapterStart(chapters, 31)).toBeUndefined()
    expect(previousChapterStart(chapters, 20)).toBe(10)
    expect(previousChapterStart(chapters, 11)).toBe(0)
    expect(previousChapterStart(chapters, 1)).toBe(0)
  })

  it('formats times', () => {
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(3723.9)).toBe('1:02:03')
    expect(formatLength(40_800)).toBe('11 h 20 m')
    expect(formatLength(2700)).toBe('45 m')
    expect(formatLength(20)).toBe('under a minute')
  })

  it('round-trips locations and ignores CFIs', () => {
    expect(audioLocation(3721.44)).toBe('t:3721.4')
    expect(parseAudioLocation('t:3721.4')).toBe(3721.4)
    expect(parseAudioLocation('epubcfi(/6/4)')).toBeUndefined()
  })

  it('rewinds 5 seconds only after a long break', () => {
    const now = 1_800_000_000_000
    const hlc = (ago: number) => encodeHlc({ wall: now - ago, counter: 0, node: 'x' })
    expect(resumeTime(100, hlc(60_000), now)).toBe(100)
    expect(resumeTime(100, hlc(11 * 60_000), now)).toBe(95)
    expect(resumeTime(2, hlc(11 * 60_000), now)).toBe(0)
  })
})

describe('chapterSpan', () => {
  it('spans the Chapter playing, up to where the next begins', () => {
    expect(chapterSpan(chapters, 35, 12)).toEqual({ start: 10, end: 30 })
  })

  it('runs the last Chapter to the end of the File', () => {
    expect(chapterSpan(chapters, 35, 31)).toEqual({ start: 30, end: 35 })
  })

  it('spans the whole File when there are no Chapters', () => {
    expect(chapterSpan([], 35, 12)).toEqual({ start: 0, end: 35 })
  })

  it('spans up to the first Chapter before it begins', () => {
    expect(chapterSpan([{ title: 'Late', start: 8 }], 35, 2)).toEqual({ start: 0, end: 8 })
  })
})
