import { createHash } from 'node:crypto'
import { type IAudioMetadata, parseFile } from 'music-metadata'
import {
  coverExtForMediaType,
  type Extracted,
  foldForMatching,
  titleFromFilename,
} from './metadata.ts'

/** Containers stored as Tracks of an Audio File, by extension; none are converted. */
const AUDIO_TYPES: Record<string, { container: string; mime: string }> = {
  mp3: { container: 'mp3', mime: 'audio/mpeg' },
  m4a: { container: 'm4a', mime: 'audio/mp4' },
  m4b: { container: 'm4b', mime: 'audio/mp4' },
  aac: { container: 'aac', mime: 'audio/aac' },
  ogg: { container: 'ogg', mime: 'audio/ogg' },
  oga: { container: 'ogg', mime: 'audio/ogg' },
  opus: { container: 'opus', mime: 'audio/ogg' },
}

const extension = (name: string) => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? ''

export function isAudioName(name: string): boolean {
  return extension(name) in AUDIO_TYPES
}

export interface AudioChapter {
  title: string
  /** Seconds from the start of the whole Audio File. */
  start: number
}

/** What one recording says about itself. */
export interface ProbedTrack {
  path: string
  originalName: string
  container: string
  mime: string
  duration: number
  title: string | undefined
  album: string | undefined
  author: string | undefined
  year: string | undefined
  genres: string[]
  description: string | undefined
  disc: number | undefined
  track: number | undefined
  /** Chapters inside this recording, in seconds from its own start. */
  chapters: AudioChapter[]
  cover: Extracted['cover']
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

function chaptersOf(meta: IAudioMetadata): AudioChapter[] {
  return (meta.format.chapters ?? [])
    .map((c, i) => ({
      title: c.title.trim() || `Chapter ${i + 1}`,
      start: c.start / (c.timeScale ?? 1),
    }))
    .filter((c) => Number.isFinite(c.start))
    .sort((a, b) => a.start - b.start)
}

export async function probeAudio(path: string, originalName: string): Promise<ProbedTrack> {
  const type = AUDIO_TYPES[extension(originalName)] ?? { container: 'other', mime: 'audio/mpeg' }
  const meta = await parseFile(path, { duration: true, includeChapters: true })
  const c = meta.common
  const picture = c.picture?.find((p) => /front/i.test(p.type ?? '')) ?? c.picture?.[0]
  const coverExt = coverExtForMediaType(picture?.format)
  const comment = c.comment?.map((x) => (typeof x === 'string' ? x : x.text)).find(text)
  return {
    path,
    originalName,
    ...type,
    duration: meta.format.duration ?? 0,
    title: text(c.title),
    album: text(c.album),
    author: text(c.albumartist) ?? text(c.artist),
    year: c.year ? String(c.year) : text(c.date),
    genres: (c.genre ?? []).map((g) => g.trim()).filter(Boolean),
    description: text(c.description?.[0]) ?? text(comment),
    disc: c.disk.no ?? undefined,
    track: c.track.no ?? undefined,
    chapters: chaptersOf(meta),
    cover: picture && coverExt ? { data: Buffer.from(picture.data), ext: coverExt } : undefined,
  }
}

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Disc, then track number, then file name with numbers compared as numbers. */
export function orderTracks<T extends Pick<ProbedTrack, 'disc' | 'track' | 'originalName'>>(
  tracks: T[],
): T[] {
  const n = (v: number | undefined) => v ?? Number.MAX_SAFE_INTEGER
  return [...tracks].sort(
    (a, b) =>
      n(a.disc) - n(b.disc) ||
      n(a.track) - n(b.track) ||
      natural.compare(a.originalName, b.originalName),
  )
}

/**
 * Recordings sharing an album tag are one Audio File. Untagged ones are one together,
 * unless `untaggedApart`, where each stands alone (loose files at the top of a folder).
 */
export function groupTracks<
  T extends Pick<ProbedTrack, 'album' | 'disc' | 'track' | 'originalName'>,
>(tracks: T[], { untaggedApart = false } = {}): T[][] {
  const groups = new Map<string, T[]>()
  for (const track of tracks) {
    const key = track.album
      ? `album:${foldForMatching(track.album)}`
      : untaggedApart
        ? `file:${track.originalName}`
        : ''
    groups.set(key, [...(groups.get(key) ?? []), track])
  }
  return [...groups.values()].map(orderTracks)
}

/** Embedded chapters where present, else one Chapter per Track; in Audio File seconds. */
export function chaptersFor(tracks: ProbedTrack[]): AudioChapter[] {
  const chapters: AudioChapter[] = []
  let offset = 0
  for (const t of tracks) {
    if (t.chapters.length)
      chapters.push(...t.chapters.map((c) => ({ title: c.title, start: offset + c.start })))
    else if (tracks.length > 1)
      chapters.push({ title: t.title ?? titleFromFilename(t.originalName), start: offset })
    offset += t.duration
  }
  return chapters
}

/** An Audio File has no blob of its own; this names it for "already in your library". */
export function audioIdentity(trackShas: string[]): string {
  return createHash('sha256').update(trackShas.join('\n')).digest('hex')
}

/** Book metadata from the first Track that has each tag. */
export function audioExtracted(tracks: ProbedTrack[], fallbackName: string): Extracted {
  const first = <K extends keyof ProbedTrack>(key: K) =>
    tracks.map((t) => t[key]).find((v) => v !== undefined && v !== '')
  const single = tracks.length === 1
  const title =
    (first('album') as string | undefined) ??
    (single ? tracks[0]?.title : undefined) ??
    titleFromFilename(fallbackName)
  const author = first('author') as string | undefined
  const description = first('description') as string | undefined
  const year = first('year') as string | undefined
  const cover = first('cover') as Extracted['cover']
  return {
    metadata: {
      title,
      authors: author ? [author] : [],
      ...(description && { description }),
      ...(year && { publishedDate: year }),
      tags: [...new Set(tracks.flatMap((t) => t.genres))],
    },
    ...(cover && { cover }),
  }
}
