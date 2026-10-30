import { compareHlc } from '@papyrus/shared'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, unwrap } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { useIsMobile } from '@/hooks/use-media-query'
import { useSession } from '@/lib/session'
import { FoliateReader, type FoliateReaderHandle, type TapZone } from '@/reader/foliate-reader'
import { TocList, TypographyPanel } from '@/reader/panels'
import { READER_THEMES, useReaderPrefs } from '@/reader/prefs'
import { syncEngine } from '@/sync'
import { type LocalProgress, readLocalProgress } from '@/sync/local-progress'
import type { RelocateDetail, TocItem } from '@/vendor/foliate-js/view.js'

export function ReaderPage() {
  const { fileId = '' } = useParams()
  const { data: profile } = useSession()
  const info = useQuery({
    queryKey: ['files', 'info', fileId],
    queryFn: () => unwrap(api.GET('/api/files/{fileId}/info', { params: { path: { fileId } } })),
  })
  // Best effort: offline, the reader resumes from this device's own copy.
  const state = useQuery({
    queryKey: ['files', 'state', fileId],
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: () => unwrap(api.GET('/api/files/{fileId}/state', { params: { path: { fileId } } })),
  })
  const blob = useQuery({
    queryKey: ['files', 'blob', fileId],
    enabled: Boolean(info.data?.readable),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    queryFn: async () => {
      const res = await fetch(info.data?.url ?? '', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`Couldn't download the File (${res.status})`)
      // foliate-js sniffs some formats by name, so it needs a File rather than a bare Blob.
      const blob = await res.blob()
      return new File([blob], `book.${info.data?.format}`, { type: blob.type })
    },
  })

  if (!profile) return null
  if (info.isError)
    return <ReaderMessage>This File doesn't exist or isn't Shared with you.</ReaderMessage>
  if (info.data && !info.data.readable)
    return (
      <ReaderMessage bookId={info.data.bookId}>
        This format can be downloaded but not read in the browser.
      </ReaderMessage>
    )
  if (blob.isError)
    return <ReaderMessage bookId={info.data?.bookId}>{blob.error.message}</ReaderMessage>
  if (!info.data || !blob.data || state.isPending) return <ReaderMessage>Opening…</ReaderMessage>

  return (
    <Reader
      key={fileId}
      profileId={profile.id}
      fileId={fileId}
      bookId={info.data.bookId}
      title={info.data.title}
      file={blob.data}
      remote={state.data?.progress ?? null}
    />
  )
}

function ReaderMessage({ children, bookId }: { children: string; bookId?: string | undefined }) {
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

function Reader({
  profileId,
  fileId,
  bookId,
  title,
  file,
  remote,
}: {
  profileId: string
  fileId: string
  bookId: string
  title: string
  file: Blob
  remote: LocalProgress | null
}) {
  const reader = useRef<FoliateReaderHandle>(null)
  const [prefs, setPrefs] = useReaderPrefs(profileId)
  const [{ initial, offer }] = useState(() =>
    startingPoint(readLocalProgress(profileId, fileId), remote),
  )
  const [jumpOffer, setJumpOffer] = useState(offer)
  const ready = useRef(false)
  const [toc, setToc] = useState<TocItem[]>([])
  const [location, setLocation] = useState<RelocateDetail | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState<'toc' | 'aa' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const theme = READER_THEMES[prefs.theme]

  const onRelocate = useCallback(
    (detail: RelocateDetail) => {
      setLocation(detail)
      // Not before the initial navigation: reopening on a stale device must not overwrite a
      // newer position from another device with a fresh timestamp.
      if (ready.current && detail.cfi)
        void syncEngine.record(profileId, {
          kind: 'progress',
          fileId,
          cfi: detail.cfi,
          fraction: detail.fraction,
        })
    },
    [profileId, fileId],
  )

  const onReady = useCallback((items: TocItem[]) => {
    ready.current = true
    setToc(items)
  }, [])

  const onTap = useCallback((zone: TapZone) => {
    if (zone === 'center') return setChrome((c) => !c)
    setChrome(false)
    if (zone === 'left') reader.current?.goLeft()
    else reader.current?.goRight()
  }, [])

  const fraction = scrub ?? location?.fraction ?? initial?.fraction ?? 0
  const bar = 'absolute inset-x-0 z-10 flex items-center gap-2 px-3 transition-opacity duration-200'

  return (
    <div
      className="fixed inset-0 select-none"
      style={{ background: theme.bg, color: theme.fg, colorScheme: theme.dark ? 'dark' : 'light' }}
    >
      <div className="absolute inset-x-0 top-12 bottom-14">
        <FoliateReader
          ref={reader}
          file={file}
          lastLocation={initial?.cfi}
          prefs={prefs}
          onReady={onReady}
          onRelocate={onRelocate}
          onTap={onTap}
          onError={(e) => setError(e.message)}
        />
      </div>

      {jumpOffer && (
        <div
          role="status"
          className="absolute inset-x-0 bottom-16 z-20 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 text-popover-foreground text-sm shadow-lg"
        >
          <span>You were at {Math.round(jumpOffer.fraction * 100)}% on another device.</span>
          <Button
            size="sm"
            onClick={() => {
              reader.current?.goTo(jumpOffer.cfi)
              setJumpOffer(null)
            }}
          >
            Jump there
          </Button>
          <Button size="sm" variant="ghost" aria-label="Dismiss" onClick={() => setJumpOffer(null)}>
            ✕
          </Button>
        </div>
      )}

      {error && (
        <div
          className="absolute inset-0 z-20 grid place-items-center p-6 text-center"
          style={{ background: theme.bg }}
        >
          <div>
            <p>Couldn't open this book: {error}</p>
            <Link to={`/books/${bookId}`} className="mt-2 inline-block underline">
              Back
            </Link>
          </div>
        </div>
      )}

      <header
        className={`${bar} top-0 h-12 pt-[env(safe-area-inset-top)] ${chrome ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{ background: theme.bg }}
      >
        <Button
          variant="ghost"
          size="sm"
          render={<Link to={`/books/${bookId}`} />}
          style={{ color: theme.fg }}
        >
          ← Back
        </Button>
        <div className="min-w-0 flex-1 truncate text-center text-sm">
          <span className="font-medium">{title}</span>
          {location?.tocItem?.label && (
            <span className="opacity-60"> · {location.tocItem.label.trim()}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanel('toc')}
          disabled={!toc.length}
          style={{ color: theme.fg }}
        >
          Contents
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanel('aa')}
          aria-label="Text and layout"
          style={{ color: theme.fg }}
        >
          Aa
        </Button>
      </header>

      <footer
        className={`${bar} bottom-0 h-14 pb-[env(safe-area-inset-bottom)] ${chrome ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{ background: theme.bg }}
      >
        <Slider
          className="flex-1"
          min={0}
          max={1000}
          value={Math.round(fraction * 1000)}
          getAriaLabel={() => 'Position in book'}
          onValueChange={(v) =>
            setScrub((Array.isArray(v) ? (v[0] as number) : (v as number)) / 1000)
          }
          onValueCommitted={(v) => {
            const f = (Array.isArray(v) ? (v[0] as number) : (v as number)) / 1000
            setScrub(null)
            reader.current?.goToFraction(f)
          }}
        />
        <span className="w-12 text-end text-xs tabular-nums opacity-70">
          {Math.round(fraction * 100)}%
        </span>
      </footer>

      <Sheet open={panel === 'toc'} onOpenChange={(open) => setPanel(open ? 'toc' : null)}>
        <SheetPopup side="left">
          <SheetHeader>
            <SheetTitle>Contents</SheetTitle>
          </SheetHeader>
          <SheetPanel>
            <TocList
              items={toc}
              current={location?.tocItem?.href}
              onPick={(href) => {
                setPanel(null)
                reader.current?.goTo(href)
              }}
            />
          </SheetPanel>
        </SheetPopup>
      </Sheet>

      <Sheet open={panel === 'aa'} onOpenChange={(open) => setPanel(open ? 'aa' : null)}>
        <SheetPopup side={isMobile ? 'bottom' : 'right'}>
          <SheetHeader>
            <SheetTitle>Text and layout</SheetTitle>
          </SheetHeader>
          <SheetPanel>
            <TypographyPanel prefs={prefs} onChange={setPrefs} />
          </SheetPanel>
        </SheetPopup>
      </Sheet>
    </div>
  )
}

/**
 * Resume from the newer of this device's copy and the server's. When another device is
 * ahead, stay put and offer to jump instead of moving the page under the reader (ticket 08).
 */
function startingPoint(local: LocalProgress | null, remote: LocalProgress | null) {
  if (!remote) return { initial: local, offer: null }
  if (!local) return { initial: remote, offer: null }
  const remoteNewer = compareHlc(remote.hlc, local.hlc) > 0
  const elsewhere = remote.deviceId !== syncEngine.deviceId
  const moved = Math.abs(remote.fraction - local.fraction) > 0.002
  return { initial: local, offer: remoteNewer && elsewhere && moved ? remote : null }
}
