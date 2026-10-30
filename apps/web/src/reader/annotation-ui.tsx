import { HIGHLIGHT_COLOURS, type HighlightColour, NOTE_MAX } from '@papyrus/shared'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Bookmark, Highlight } from '@/sync/annotations'
import { HIGHLIGHT_FILL } from './use-annotations'

/** A small bar above (or, near the top, below) a rect on screen, kept inside the viewport. */
export function FloatingBar({ rect, children }: { rect: DOMRect; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: rect.left, top: rect.top - 52 })
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8,
    )
    const above = rect.top - height - 8
    setPos({ left, top: above > 56 ? above : rect.bottom + 8 })
  }, [rect])
  return (
    <div
      ref={bar}
      className="fixed z-30 flex items-center gap-1 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}

export function ColourSwatches({
  current,
  onPick,
}: {
  current?: HighlightColour | undefined
  onPick: (colour: HighlightColour) => void
}) {
  return (
    <>
      {HIGHLIGHT_COLOURS.map((colour) => (
        <button
          key={colour}
          type="button"
          aria-label={`Highlight ${colour}`}
          aria-pressed={colour === current}
          onClick={() => onPick(colour)}
          className={cn(
            'mx-0.5 size-7 rounded-full ring-offset-2 ring-offset-popover',
            colour === current && 'ring-2 ring-foreground',
          )}
          style={{ background: HIGHLIGHT_FILL[colour] }}
        />
      ))}
    </>
  )
}

export function HighlightPicker({
  rect,
  highlights,
  onPick,
}: {
  rect: DOMRect
  highlights: Highlight[]
  onPick: (h: Highlight) => void
}) {
  return (
    <FloatingBar rect={rect}>
      <ul className="flex max-w-80 flex-col">
        {highlights.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onPick(h)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-accent"
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ background: HIGHLIGHT_FILL[h.colour] }}
              />
              <span className="line-clamp-1">{h.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </FloatingBar>
  )
}

export function NoteDialog({
  open,
  initial,
  quote,
  onOpenChange,
  onSave,
}: {
  open: boolean
  initial: string
  quote: string
  onOpenChange: (open: boolean) => void
  onSave: (note: string) => void
}) {
  const [note, setNote] = useState(initial)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            onSave(note)
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Note</DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-3">
            <blockquote className="line-clamp-4 border-s-2 ps-3 text-muted-foreground text-sm">
              {quote}
            </blockquote>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              rows={5}
              autoFocus
              aria-label="Note"
            />
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}

type Entry =
  | { kind: 'highlight'; item: Highlight; cfi: string }
  | { kind: 'bookmark'; item: Bookmark; cfi: string }

export function AnnotationsPanel({
  entries,
  onGo,
  onExport,
}: {
  entries: Entry[]
  onGo: (cfi: string) => void
  onExport: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Select text to highlight it, or bookmark a page from the top bar.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li key={e.item.id}>
              <button
                type="button"
                onClick={() => onGo(e.cfi)}
                className="flex w-full gap-3 rounded-lg px-2 py-2 text-start text-sm hover:bg-accent"
              >
                {e.kind === 'highlight' ? (
                  <span
                    className="mt-1 size-3 shrink-0 rounded-full"
                    style={{ background: HIGHLIGHT_FILL[e.item.colour] }}
                  />
                ) : (
                  <span className="shrink-0" aria-label="Bookmark">
                    🔖
                  </span>
                )}
                <span className="min-w-0">
                  <span className="line-clamp-3">
                    {e.kind === 'highlight' ? e.item.text : e.item.snippet || 'Bookmark'}
                  </span>
                  {e.kind === 'highlight' && e.item.note && (
                    <span className="mt-1 line-clamp-3 block text-muted-foreground">
                      {e.item.note}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" onClick={onExport}>
        Export highlights (Markdown)
      </Button>
    </div>
  )
}

export type { Entry as AnnotationEntry }
