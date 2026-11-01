import { compareHlc } from '@papyrus/shared'
import { useQuery } from '@tanstack/react-query'
import {
  BookmarkIcon,
  BookmarkPlusIcon,
  ChevronDownIcon,
  ListIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, unwrap } from '@/api/client'
import { AmbientBlobs } from '@/components/ambient'
import { BookCover } from '@/components/book-cover'
import { Button } from '@/components/ui/button'
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { useIsMobile } from '@/hooks/use-media-query'
import { isUnreachable } from '@/lib/offline'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { type PlayerItem, SKIP_BACK, SKIP_FORWARD, SPEEDS } from '@/player/player'
import { usePlayer, usePlayerState } from '@/player/provider'
import {
  audioLocation,
  chapterAt,
  chapterSpan,
  formatClock,
  parseAudioLocation,
  resumeTime,
} from '@/player/timeline'
import { waveformBars } from '@/player/waveform'
import { useAnnotations } from '@/reader/use-annotations'
import { offlineStore, syncEngine } from '@/sync'
import { readLocalProgress } from '@/sync/local-progress'

const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60, 90, 120]

export function ListenPage() {
  const { fileId = '' } = useParams()
  const { data: profile } = useSession()
  const profileId = profile?.id ?? ''
  const player = usePlayer()
  const { item } = usePlayerState()
  const loaded = item?.fileId === fileId && item.profileId === profileId

  const info = useQuery({
    queryKey: ['files', 'info', fileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      try {
        return await unwrap(api.GET('/api/files/{fileId}/info', { params: { path: { fileId } } }))
      } catch (error) {
        // Offline, an Offline Book plays from what this device saved (spec: Offline).
        const saved = isUnreachable(error)
          ? await offlineStore.findFile(profileId, fileId)
          : undefined
        const audio = saved?.files.find((f) => f.id === fileId)?.audio
        if (!saved || !audio) throw error
        return {
          bookId: saved.bookId,
          title: saved.title,
          authors: saved.authors,
          coverUrl: saved.coverUrl,
          duration: audio.duration,
          tracks: audio.tracks,
          chapters: audio.chapters,
        }
      }
    },
  })
  const state = useQuery({
    queryKey: ['files', 'state', fileId],
    enabled: !loaded,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: () => unwrap(api.GET('/api/files/{fileId}/state', { params: { path: { fileId } } })),
  })

  // Opening another Audio File takes over the Player; the same one just shows it.
  const settled = !state.isPending || state.isError
  useEffect(() => {
    if (loaded || !info.data || !settled || !profileId) return
    const data = info.data
    if (!data.tracks.length) return
    const local = readLocalProgress(profileId, fileId)
    const remote = state.data?.progress ?? null
    const newest =
      local && remote ? (compareHlc(remote.hlc, local.hlc) > 0 ? remote : local) : (local ?? remote)
    const saved = parseAudioLocation(newest?.cfi) ?? 0
    const audioItem: PlayerItem = {
      profileId,
      fileId,
      bookId: data.bookId,
      title: data.title,
      authors: data.authors,
      coverUrl: data.coverUrl,
      duration: data.duration ?? data.tracks.reduce((n, t) => n + t.duration, 0),
      tracks: data.tracks.map((t) => ({ url: t.url, duration: t.duration, title: t.title })),
      chapters: data.chapters,
    }
    player.load(audioItem, resumeTime(saved, newest?.hlc))
  }, [loaded, info.data, settled, state.data, profileId, fileId, player])

  if (!profile) return null
  if (info.isError)
    return <ListenMessage>This File doesn't exist or isn't Shared with you.</ListenMessage>
  if (info.data && !info.data.tracks.length)
    return <ListenMessage bookId={info.data.bookId}>This File isn't an audiobook.</ListenMessage>
  if (!loaded || !item) return <ListenMessage>Opening…</ListenMessage>
  return <FullPlayer item={item} />
}

function ListenMessage({ children, bookId }: { children: string; bookId?: string | undefined }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-muted-foreground">{children}</p>
        <Link to={bookId ? `/books/${bookId}` : '/'} className="mt-2 inline-block underline">
          Back
        </Link>
      </div>
    </div>
  )
}

function FullPlayer({ item }: { item: PlayerItem }) {
  const player = usePlayer()
  const { playing, time, speed, sleep, waiting, error } = usePlayerState()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [scrub, setScrub] = useState<number | null>(null)
  const [panel, setPanel] = useState<'chapters' | 'bookmarks' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { bookmarks: stored } = useAnnotations(item.profileId, item.fileId)
  const bookmarks = useMemo(
    () =>
      stored
        .map((b) => ({ bookmark: b, time: parseAudioLocation(b.cfi) }))
        .filter((b): b is typeof b & { time: number } => b.time !== undefined)
        .sort((a, b) => a.time - b.time),
    [stored],
  )

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(id)
  }, [notice])

  // A Bookmark is a Chapter and a time; Highlights and Notes don't apply to audio.
  const addBookmark = () => {
    const at = player.getState().time
    const title = item.chapters[chapterAt(item.chapters, at)]?.title ?? item.title
    void syncEngine.record(item.profileId, {
      kind: 'bookmark',
      id: crypto.randomUUID(),
      fileId: item.fileId,
      cfi: audioLocation(at),
      snippet: `${title} · ${formatClock(at)}`.slice(0, 140),
      deleted: false,
    })
    setNotice(`Bookmarked ${formatClock(at)}`)
  }
  const shown = scrub ?? time
  const chapterIndex = chapterAt(item.chapters, shown)
  const chapter = item.chapters[chapterIndex]
  // The timeline is the Chapter playing. It follows the player, not a drag, so it holds still
  // while scrubbing to the very end of the Chapter.
  const span = chapterSpan(item.chapters, item.duration, time)
  const inChapter = Math.min(span.end, Math.max(span.start, shown))
  const left = (span.end - inChapter) / speed

  // Space toggles, arrows skip, as in most players.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [role="slider"], [role="menu"]')) return
      if (e.key === ' ') {
        e.preventDefault()
        player.toggle()
      } else if (e.key === 'ArrowLeft') player.skip(-SKIP_BACK)
      else if (e.key === 'ArrowRight') player.skip(SKIP_FORWARD)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player])

  const extra =
    'flex min-w-16 flex-col items-center gap-1 rounded-xl px-3 py-1.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-white/5 hover:text-foreground [&_svg]:size-5'

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <AmbientBlobs coverUrl={item.coverUrl} playing={playing} />
      <header className="flex h-12 items-center gap-1 px-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Back"
          onClick={() => (history.length > 1 ? navigate(-1) : navigate(`/books/${item.bookId}`))}
        >
          <ChevronDownIcon />
        </Button>
        <Link
          to={`/books/${item.bookId}`}
          className="min-w-0 flex-1 truncate text-center text-muted-foreground text-sm hover:underline"
        >
          {item.title}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Add bookmark"
          onClick={addBookmark}
        >
          <BookmarkPlusIcon />
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 pb-8 md:grid md:max-w-5xl md:grid-cols-2 md:items-center md:gap-16 md:px-10">
        <div
          className={cn(
            'animate-cover-in transition-transform duration-700 ease-spring',
            playing ? 'scale-100' : 'scale-[0.92]',
          )}
        >
          <BookCover
            title={item.title}
            coverUrl={item.coverUrl}
            className={cn(
              'mx-auto aspect-square w-[min(18rem,70vw,38dvh)] rounded-2xl shadow-2xl shadow-black/60 md:w-full md:max-w-md',
              // A cover keeps its own shape: square for audiobooks, tall for a Book's ebook.
              item.coverUrl &&
                'overflow-visible bg-transparent shadow-none [&_img]:mx-auto [&_img]:h-full [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-2xl [&_img]:object-contain [&_img]:shadow-2xl [&_img]:shadow-black/60',
            )}
          />
        </div>

        <div className="flex animate-rise flex-col gap-6 [animation-delay:80ms]">
          <div className="text-center md:text-start">
            <h1 className="text-balance font-semibold text-2xl tracking-tight">{item.title}</h1>
            {item.authors.length > 0 && (
              <p className="text-muted-foreground">{item.authors.join(', ')}</p>
            )}
            <p
              className="mt-2 flex min-h-5 items-center justify-center gap-2 truncate font-medium text-sm md:justify-start"
              aria-live="polite"
            >
              {chapter && <Equalizer playing={playing} />}
              {chapter?.title}
            </p>
          </div>

          <div>
            <Waveform
              seed={`${item.fileId}:${span.start}`}
              start={span.start}
              end={span.end}
              value={inChapter}
              onScrub={setScrub}
              onCommit={(v) => {
                setScrub(null)
                player.seek(v)
              }}
            />
            <div className="mt-1.5 flex justify-between text-muted-foreground text-xs tabular-nums">
              <span data-testid="elapsed">{formatClock(inChapter - span.start)}</span>
              <span>-{formatClock(left)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label="Previous chapter"
              onClick={() => player.previousChapter()}
            >
              <SkipBackIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label={`Back ${SKIP_BACK} seconds`}
              onClick={() => player.skip(-SKIP_BACK)}
            >
              <RotateCcwIcon />
            </Button>
            <Button
              size="icon-xl"
              className="mx-1 size-18 rounded-full shadow-black/40 shadow-lg transition-transform active:scale-90 sm:size-18"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={() => player.toggle()}
            >
              {playing ? (
                <PauseIcon key="pause" className="size-7 animate-pop fill-current" />
              ) : (
                <PlayIcon key="play" className="size-7 animate-pop fill-current" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label={`Forward ${SKIP_FORWARD} seconds`}
              onClick={() => player.skip(SKIP_FORWARD)}
            >
              <RotateCwIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              aria-label="Next chapter"
              disabled={chapterIndex >= item.chapters.length - 1}
              onClick={() => player.nextChapter()}
            >
              <SkipForwardIcon />
            </Button>
          </div>

          <p
            className={cn(
              'min-h-5 text-center text-sm',
              error ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {error ?? notice ?? (waiting && playing ? 'Loading…' : '')}
          </p>

          <div className="flex items-start justify-between gap-1">
            <Menu>
              <MenuTrigger render={<button type="button" className={extra} aria-label="Speed" />}>
                <span className="grid h-5 place-items-center font-semibold text-foreground text-sm tabular-nums">
                  {+speed.toFixed(2)}×
                </span>
                Speed
              </MenuTrigger>
              <MenuPopup align="center">
                <MenuGroup>
                  <MenuGroupLabel>Speed</MenuGroupLabel>
                  <MenuRadioGroup value={speed} onValueChange={(v) => player.setSpeed(Number(v))}>
                    {SPEEDS.map((s) => (
                      <MenuRadioItem key={s} value={s} closeOnClick>
                        {s}×
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuGroup>
                <MenuSeparator />
                <MenuItem
                  onClick={() => player.setSpeed(Math.max(0.75, +(speed - 0.05).toFixed(2)))}
                >
                  Slower (−0.05)
                </MenuItem>
                <MenuItem onClick={() => player.setSpeed(Math.min(3, +(speed + 0.05).toFixed(2)))}>
                  Faster (+0.05)
                </MenuItem>
              </MenuPopup>
            </Menu>
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    className={cn(extra, sleep && 'text-foreground')}
                    aria-label="Sleep timer"
                  />
                }
              >
                <MoonIcon className={sleep ? 'fill-current' : undefined} />
                {sleep ? <SleepLeft sleep={sleep} /> : 'Sleep'}
              </MenuTrigger>
              <MenuPopup align="center">
                <MenuGroup>
                  <MenuGroupLabel>Sleep timer</MenuGroupLabel>
                  {SLEEP_MINUTES.map((m) => (
                    <MenuItem
                      key={m}
                      onClick={() => player.setSleep({ kind: 'minutes', minutes: m })}
                    >
                      {m < 60 ? `${m} minutes` : `${m / 60} ${m === 60 ? 'hour' : 'hours'}`}
                    </MenuItem>
                  ))}
                  <MenuItem
                    disabled={!item.chapters.length}
                    onClick={() => player.setSleep({ kind: 'chapter' })}
                  >
                    End of chapter
                  </MenuItem>
                </MenuGroup>
                {sleep && (
                  <>
                    <MenuSeparator />
                    <MenuItem onClick={() => player.setSleep(null)}>Turn off</MenuItem>
                  </>
                )}
              </MenuPopup>
            </Menu>
            <button
              type="button"
              className={cn(extra, 'disabled:pointer-events-none disabled:opacity-50')}
              aria-label="Chapters"
              disabled={!item.chapters.length}
              onClick={() => setPanel('chapters')}
            >
              <ListIcon />
              Chapters
            </button>
            <button
              type="button"
              className={extra}
              aria-label="Bookmarks"
              onClick={() => setPanel('bookmarks')}
            >
              <BookmarkIcon />
              Bookmarks
            </button>
          </div>
        </div>
      </main>

      <Sheet
        open={panel === 'bookmarks'}
        onOpenChange={(open) => setPanel(open ? 'bookmarks' : null)}
      >
        <SheetPopup side={isMobile ? 'bottom' : 'right'}>
          <SheetHeader>
            <SheetTitle>Bookmarks</SheetTitle>
          </SheetHeader>
          <SheetPanel>
            {bookmarks.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No bookmarks yet. Add one with the bookmark button at the top.
              </p>
            ) : (
              <ol className="-mx-2">
                {bookmarks.map(({ bookmark, time: at }) => (
                  <li key={bookmark.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-baseline gap-3 rounded-lg px-2 py-2 text-start hover:bg-accent"
                      onClick={() => {
                        player.seek(at)
                        setPanel(null)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.chapters[chapterAt(item.chapters, at)]?.title ?? item.title}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatClock(at)}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete bookmark at ${formatClock(at)}`}
                      onClick={() => {
                        const { kind: _k, profileId: _p, hlc: _h, ...fields } = bookmark
                        void syncEngine.record(item.profileId, {
                          kind: 'bookmark',
                          ...fields,
                          deleted: true,
                        })
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </SheetPanel>
        </SheetPopup>
      </Sheet>

      <Sheet
        open={panel === 'chapters'}
        onOpenChange={(open) => setPanel(open ? 'chapters' : null)}
      >
        <SheetPopup side={isMobile ? 'bottom' : 'right'}>
          <SheetHeader>
            <SheetTitle>Chapters</SheetTitle>
          </SheetHeader>
          <SheetPanel>
            <ol className="-mx-2">
              {item.chapters.map((c, i) => (
                <li key={`${c.start}-${c.title}`}>
                  <button
                    type="button"
                    aria-current={i === chapterIndex ? 'true' : undefined}
                    className="flex w-full items-baseline gap-3 rounded-lg px-2 py-2 text-start hover:bg-accent aria-[current]:font-medium aria-[current]:text-primary"
                    onClick={() => {
                      player.seek(c.start)
                      setPanel(null)
                    }}
                  >
                    <span className="min-w-0 flex-1">{c.title}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatClock(c.start)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </SheetPanel>
        </SheetPopup>
      </Sheet>
    </div>
  )
}

/** Three bars that bounce while the chapter plays. */
function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden className="flex h-3.5 w-4 shrink-0 items-end gap-0.5">
      {[0, -0.3, -0.6].map((delay) => (
        <span
          key={delay}
          className={cn('h-2/5 flex-1 rounded-[1px] bg-current', playing && 'animate-eq')}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  )
}

const BARS = 56

/** The position slider drawn as a waveform: played bars bright, the rest dim. */
function Waveform({
  seed,
  start,
  end,
  value,
  onScrub,
  onCommit,
}: {
  seed: string
  /** The Chapter's bounds, in seconds across the whole File. */
  start: number
  end: number
  value: number
  onScrub: (seconds: number) => void
  onCommit: (seconds: number) => void
}) {
  const bars = useMemo(() => waveformBars(seed, BARS), [seed])
  const played = end > start ? (value - start) / (end - start) : 0
  const seconds = (v: number | readonly number[]) =>
    Array.isArray(v) ? (v[0] as number) : (v as number)
  return (
    <div className="relative h-12 rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60 has-[:focus-visible]:ring-offset-4 has-[:focus-visible]:ring-offset-background">
      <div aria-hidden className="absolute inset-0 flex items-center gap-[3px]">
        {bars.map((height, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional
            key={i}
            className={cn(
              'flex-1 rounded-full transition-colors duration-300',
              (i + 0.5) / BARS <= played ? 'bg-foreground' : 'bg-foreground/20',
            )}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <Slider
        // The bars show the position; the slider's own track and thumb stay invisible.
        className="absolute inset-0 cursor-pointer [&_[data-slot=slider-control]]:h-full [&_[data-slot=slider-control]]:items-center [&_[data-slot=slider-indicator]]:bg-transparent [&_[data-slot=slider-thumb]]:opacity-0 [&_[data-slot=slider-track]]:before:bg-transparent"
        min={start}
        max={Math.max(start + 1, end)}
        value={value}
        getAriaLabel={() => 'Position in chapter'}
        onValueChange={(v) => onScrub(seconds(v))}
        onValueCommitted={(v) => onCommit(seconds(v))}
      />
    </div>
  )
}

/** Minutes left on a sleep timer; re-renders each second while it runs. */
function SleepLeft({ sleep }: { sleep: NonNullable<ReturnType<typeof usePlayerState>['sleep']> }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (sleep.kind === 'chapter') return <span>Chapter</span>
  return <span className="tabular-nums">{formatClock((sleep.endsAt - Date.now()) / 1000)}</span>
}
