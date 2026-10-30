import { compareHlc } from '@papyrus/shared'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDownIcon,
  ListIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, unwrap } from '@/api/client'
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
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { type PlayerItem, SKIP_BACK, SKIP_FORWARD, SPEEDS } from '@/player/player'
import { usePlayer, usePlayerState } from '@/player/provider'
import { chapterAt, formatClock, parseAudioLocation, resumeTime } from '@/player/timeline'
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
    queryFn: () => unwrap(api.GET('/api/files/{fileId}/info', { params: { path: { fileId } } })),
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
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const shown = scrub ?? time
  const chapterIndex = chapterAt(item.chapters, shown)
  const chapter = item.chapters[chapterIndex]
  const left = (item.duration - shown) / speed

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

  return (
    <div className="flex min-h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex h-12 items-center gap-2 px-3">
        <Button
          variant="ghost"
          size="icon"
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
          aria-label="Chapters"
          disabled={!item.chapters.length}
          onClick={() => setChaptersOpen(true)}
        >
          <ListIcon />
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-6 pb-6">
        <BookCover
          title={item.title}
          coverUrl={item.coverUrl}
          className="mx-auto aspect-square w-[min(17rem,65vw,38dvh)] shadow-xl [&_img]:object-contain"
        />
        <div className="text-center">
          <h1 className="font-semibold text-xl tracking-tight">{item.title}</h1>
          {item.authors.length > 0 && (
            <p className="text-muted-foreground">{item.authors.join(', ')}</p>
          )}
          <p className="mt-1 min-h-5 truncate text-sm" aria-live="polite">
            {chapter?.title}
          </p>
        </div>

        <div>
          <Slider
            min={0}
            max={Math.max(1, Math.round(item.duration))}
            value={Math.round(shown)}
            getAriaLabel={() => 'Position'}
            onValueChange={(v) => setScrub(Array.isArray(v) ? (v[0] as number) : (v as number))}
            onValueCommitted={(v) => {
              setScrub(null)
              player.seek(Array.isArray(v) ? (v[0] as number) : (v as number))
            }}
          />
          <div className="mt-1.5 flex justify-between text-muted-foreground text-xs tabular-nums">
            <span data-testid="elapsed">{formatClock(shown)}</span>
            <span>-{formatClock(left)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Previous chapter"
            onClick={() => player.previousChapter()}
          >
            <SkipBackIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Back ${SKIP_BACK} seconds`}
            onClick={() => player.skip(-SKIP_BACK)}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            size="icon-xl"
            className="size-16 rounded-full sm:size-16"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => player.toggle()}
          >
            {playing ? <PauseIcon className="size-7" /> : <PlayIcon className="size-7" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Forward ${SKIP_FORWARD} seconds`}
            onClick={() => player.skip(SKIP_FORWARD)}
          >
            <RotateCwIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
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
          {error ?? (waiting && playing ? 'Loading…' : '')}
        </p>

        <div className="flex items-center justify-center gap-2">
          <Menu>
            <MenuTrigger render={<Button variant="outline" size="sm" aria-label="Speed" />}>
              {+speed.toFixed(2)}×
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
              <MenuItem onClick={() => player.setSpeed(Math.max(0.75, +(speed - 0.05).toFixed(2)))}>
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
                <Button
                  variant={sleep ? 'secondary' : 'outline'}
                  size="sm"
                  aria-label="Sleep timer"
                />
              }
            >
              <MoonIcon />
              {sleep && <SleepLeft sleep={sleep} />}
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
        </div>
      </main>

      <Sheet open={chaptersOpen} onOpenChange={setChaptersOpen}>
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
                      setChaptersOpen(false)
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
