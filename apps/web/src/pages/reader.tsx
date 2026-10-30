import { compareHlc, type HighlightColour } from '@papyrus/shared'
import { useQuery } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, unwrap } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { useIsMobile } from '@/hooks/use-media-query'
import { isUnreachable } from '@/lib/offline'
import { useSession } from '@/lib/session'
import { fileCacheKey } from '@/offline/caches'
import {
  type AnnotationEntry,
  AnnotationsPanel,
  ColourSwatches,
  FloatingBar,
  HighlightPicker,
  NoteDialog,
} from '@/reader/annotation-ui'
import { SearchPanel, useBookSearch } from '@/reader/book-search'
import {
  type BookSelection,
  FoliateReader,
  type FoliateReaderHandle,
  type TapZone,
} from '@/reader/foliate-reader'
import { TocList, TypographyPanel } from '@/reader/panels'
import { READER_THEMES, useReaderPrefs } from '@/reader/prefs'
import { TranslationCard, useTranslateTarget, useTranslationEnabled } from '@/reader/translation'
import { useAnnotations } from '@/reader/use-annotations'
import { offlineStore, syncEngine } from '@/sync'
import type { Highlight } from '@/sync/annotations'
import { type LocalProgress, readLocalProgress } from '@/sync/local-progress'
import { collapse, compare } from '@/vendor/foliate-js/epubcfi.js'
import type { RelocateDetail, TocItem } from '@/vendor/foliate-js/view.js'

export function ReaderPage() {
  const { fileId = '' } = useParams()
  const { data: profile } = useSession()
  const profileId = profile?.id ?? ''
  const info = useQuery({
    queryKey: ['files', 'info', fileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      try {
        return await unwrap(api.GET('/api/files/{fileId}/info', { params: { path: { fileId } } }))
      } catch (error) {
        // Offline, an Offline Book still opens from what this device saved (ticket 05).
        const saved = isUnreachable(error)
          ? await offlineStore.findFile(profileId, fileId)
          : undefined
        const file = saved?.files.find((f) => f.id === fileId)
        if (!saved || !file) throw error
        return {
          id: file.id,
          bookId: saved.bookId,
          title: saved.title,
          format: file.format as 'epub',
          readable: true,
          url: fileCacheKey(file.id),
        }
      }
    },
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
      // An Offline Book is read from the Cache API, online or not (ticket 05).
      let blob = await offlineStore.fileBlob(fileId).catch(() => undefined)
      if (!blob) {
        const res = await fetch(info.data?.url ?? '', { credentials: 'same-origin' })
        if (!res.ok) throw new Error(`Couldn't download the File (${res.status})`)
        blob = await res.blob()
      }
      // foliate-js sniffs some formats by name, so it needs a File rather than a bare Blob.
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
  const [panel, setPanel] = useState<'toc' | 'aa' | 'notes' | 'search' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<BookSelection | null>(null)
  const [tapped, setTapped] = useState<{ rect: DOMRect; highlights: Highlight[] } | null>(null)
  const [noteFor, setNoteFor] = useState<Highlight | null>(null)
  const [translating, setTranslating] = useState<{ text: string; rect: DOMRect } | null>(null)
  const [translateTo, setTranslateTo] = useTranslateTarget(profileId)
  const translationEnabled = useTranslationEnabled()
  const { highlights, bookmarks } = useAnnotations(profileId, fileId)
  const search = useBookSearch(reader)
  const isMobile = useIsMobile()
  const theme = READER_THEMES[prefs.theme]

  const onRelocate = useCallback(
    (detail: RelocateDetail) => {
      setLocation(detail)
      // The card points at words that have just moved or left the page.
      setTranslating(null)
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
    setTapped(null)
    setTranslating(null)
    if (zone === 'center') return setChrome((c) => !c)
    setChrome(false)
    if (zone === 'left') reader.current?.goLeft()
    else reader.current?.goRight()
  }, [])

  const saveHighlight = useCallback(
    (h: Omit<Highlight, 'kind' | 'profileId' | 'hlc'>) =>
      syncEngine.record(profileId, { kind: 'highlight', ...h }),
    [profileId],
  )

  const highlightsRef = useRef(highlights)
  highlightsRef.current = highlights

  // Selecting text that is already highlighted acts on that Highlight rather than stacking
  // a second one on top, so a later Note lands on the Highlight it was meant for.
  const highlightAt = (sel: BookSelection) =>
    highlightsRef.current.find((h) => contains(h.cfiRange, sel.cfi))

  const createHighlight = (sel: BookSelection, colour: HighlightColour): Highlight => {
    const existing = highlightAt(sel)
    if (existing) {
      if (existing.colour !== colour) void saveHighlight({ ...stripMeta(existing), colour })
      reader.current?.clearSelection()
      setSelection(null)
      return { ...existing, colour }
    }
    const h = {
      id: crypto.randomUUID(),
      fileId,
      cfiRange: sel.cfi,
      colour,
      text: sel.text.slice(0, 10_000),
      note: null,
      deleted: false,
    }
    void saveHighlight(h)
    reader.current?.clearSelection()
    setSelection(null)
    return { ...h, kind: 'highlight', profileId, hlc: '' }
  }

  // Several Highlights can overlap where the reader tapped; let them pick (ticket 08).
  const onHighlightTap = useCallback((cfi: string, rect: DOMRect) => {
    const all = highlightsRef.current
    const overlapping = all.filter((h) => overlaps(h.cfiRange, cfi))
    setTapped({
      rect,
      highlights: overlapping.length ? overlapping : all.filter((h) => h.cfiRange === cfi),
    })
  }, [])

  const bookmarkHere = location?.cfi
    ? bookmarks.find((b) => within(b.cfi, location.cfi))
    : undefined
  const toggleBookmark = () => {
    if (!location?.cfi) return
    if (bookmarkHere)
      void syncEngine.record(profileId, {
        kind: 'bookmark',
        ...stripMeta(bookmarkHere),
        deleted: true,
      })
    else
      void syncEngine.record(profileId, {
        kind: 'bookmark',
        id: crypto.randomUUID(),
        fileId,
        cfi: collapse(location.cfi),
        snippet: location.range?.toString().replace(/\s+/g, ' ').trim().slice(0, 140) ?? '',
        deleted: false,
      })
  }

  const entries = useMemo<AnnotationEntry[]>(
    () =>
      [
        ...highlights.map(
          (item): AnnotationEntry => ({ kind: 'highlight', item, cfi: item.cfiRange }),
        ),
        ...bookmarks.map((item): AnnotationEntry => ({ kind: 'bookmark', item, cfi: item.cfi })),
      ].sort((a, b) => compare(collapse(a.cfi), collapse(b.cfi))),
    [highlights, bookmarks],
  )

  // The export is built on the server, so push local changes first.
  const exportHighlights = async () => {
    await syncEngine.flush(profileId)
    window.location.href = `/api/books/${bookId}/highlights.md`
  }

  const activeHighlight = tapped?.highlights.length === 1 ? tapped.highlights[0] : undefined
  const fraction = scrub ?? location?.fraction ?? initial?.fraction ?? 0
  const bar = 'absolute inset-x-0 z-10 flex items-center gap-2 px-3 transition-opacity duration-200'
  const ghost = { color: theme.fg }

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
          highlights={highlights}
          onReady={onReady}
          onRelocate={onRelocate}
          onTap={onTap}
          onSelection={(sel) => {
            setSelection(sel)
            if (sel) setTapped(null)
          }}
          onHighlightTap={onHighlightTap}
          onFind={() => setPanel('search')}
          onError={(e) => setError(e.message)}
        />
      </div>

      {selection && (
        <FloatingBar rect={selection.rect}>
          <ColourSwatches onPick={(colour) => createHighlight(selection, colour)} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setNoteFor(createHighlight(selection, highlightAt(selection)?.colour ?? 'yellow'))
            }}
          >
            Note
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(selection.text)
              reader.current?.clearSelection()
              setSelection(null)
            }}
          >
            Copy
          </Button>
          {translationEnabled && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTranslating({ text: selection.text, rect: selection.rect })
                reader.current?.clearSelection()
                setSelection(null)
              }}
            >
              Translate
            </Button>
          )}
        </FloatingBar>
      )}

      {translating && (
        <TranslationCard
          text={translating.text}
          rect={translating.rect}
          target={translateTo}
          onTargetChange={setTranslateTo}
          onClose={() => setTranslating(null)}
        />
      )}

      {tapped && tapped.highlights.length > 1 && (
        <HighlightPicker
          rect={tapped.rect}
          highlights={tapped.highlights}
          onPick={(h) => setTapped({ rect: tapped.rect, highlights: [h] })}
        />
      )}

      {tapped && activeHighlight && (
        <FloatingBar rect={tapped.rect}>
          <ColourSwatches
            current={activeHighlight.colour}
            onPick={(colour) => {
              void saveHighlight({ ...stripMeta(activeHighlight), colour })
              setTapped(null)
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setNoteFor(activeHighlight)
              setTapped(null)
            }}
          >
            {activeHighlight.note ? 'Edit note' : 'Note'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void saveHighlight({ ...stripMeta(activeHighlight), deleted: true })
              setTapped(null)
            }}
          >
            Delete
          </Button>
        </FloatingBar>
      )}

      {noteFor && (
        <NoteDialog
          open
          initial={noteFor.note ?? ''}
          quote={noteFor.text}
          onOpenChange={(open) => !open && setNoteFor(null)}
          onSave={(note) => {
            const latest = highlightsRef.current.find((h) => h.id === noteFor.id) ?? noteFor
            void saveHighlight({ ...stripMeta(latest), note: note.trim() || null })
          }}
        />
      )}

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
        <Button variant="ghost" size="sm" render={<Link to={`/books/${bookId}`} />} style={ghost}>
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
          onClick={toggleBookmark}
          disabled={!location?.cfi}
          aria-pressed={Boolean(bookmarkHere)}
          aria-label={bookmarkHere ? 'Remove bookmark' : 'Bookmark this page'}
          style={ghost}
        >
          {bookmarkHere ? '★' : '☆'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanel('search')}
          aria-label="Search in book"
          style={ghost}
        >
          <SearchIcon />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPanel('notes')} style={ghost}>
          Notes
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanel('toc')}
          disabled={!toc.length}
          style={ghost}
        >
          Contents
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanel('aa')}
          aria-label="Text and layout"
          style={ghost}
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

      <Sheet open={panel === 'notes'} onOpenChange={(open) => setPanel(open ? 'notes' : null)}>
        <SheetPopup side={isMobile ? 'bottom' : 'right'}>
          <SheetHeader>
            <SheetTitle>Highlights and bookmarks</SheetTitle>
          </SheetHeader>
          <SheetPanel>
            <AnnotationsPanel
              entries={entries}
              onGo={(cfi) => {
                setPanel(null)
                reader.current?.goTo(cfi)
              }}
              onExport={exportHighlights}
              onDelete={(e) =>
                void (e.kind === 'highlight'
                  ? saveHighlight({ ...stripMeta(e.item), deleted: true })
                  : syncEngine.record(profileId, {
                      kind: 'bookmark',
                      ...stripMeta(e.item),
                      deleted: true,
                    }))
              }
            />
          </SheetPanel>
        </SheetPopup>
      </Sheet>

      <Sheet open={panel === 'search'} onOpenChange={(open) => setPanel(open ? 'search' : null)}>
        <SheetPopup side={isMobile ? 'bottom' : 'right'}>
          <SheetHeader>
            <SheetTitle>Search</SheetTitle>
          </SheetHeader>
          <SheetPanel>
            <SearchPanel
              state={search.state}
              onSearch={search.start}
              onCancel={search.cancel}
              onClear={search.clear}
              onPick={(cfi) => {
                reader.current?.goTo(cfi)
                setPanel(null)
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

/** The fields a change carries; the stored Profile and timestamp are re-stamped on write. */
function stripMeta<T extends { kind: string; profileId: string; hlc: string }>({
  kind: _k,
  profileId: _p,
  hlc: _h,
  ...rest
}: T) {
  return rest
}

/** Whether a point CFI falls inside a range CFI (both ends included). */
function within(point: string, range: string): boolean {
  return compare(point, collapse(range)) >= 0 && compare(point, collapse(range, true)) <= 0
}

/** Whether range `inner` lies entirely inside range `outer`. */
function contains(outer: string, inner: string): boolean {
  return within(collapse(inner), outer) && within(collapse(inner, true), outer)
}

function overlaps(a: string, b: string): boolean {
  return (
    compare(collapse(a), collapse(b, true)) <= 0 && compare(collapse(b), collapse(a, true)) <= 0
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
