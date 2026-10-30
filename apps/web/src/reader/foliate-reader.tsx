import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Highlight } from '@/sync/annotations'
import type {
  DrawAnnotationDetail,
  LoadDetail,
  RelocateDetail,
  ShowAnnotationDetail,
  TocItem,
  View,
} from '@/vendor/foliate-js/view.js'
import { bookCss, MARGINS, type ReaderPrefs } from './prefs'
import { HIGHLIGHT_FILL } from './use-annotations'

export type TapZone = 'left' | 'center' | 'right'

/** A text selection in the book, with where it is on screen. */
export interface BookSelection {
  cfi: string
  text: string
  rect: DOMRect
}

export interface FoliateReaderHandle {
  goTo(target: string): void
  goToFraction(fraction: number): void
  goLeft(): void
  goRight(): void
  clearSelection(): void
}

interface Props {
  file: Blob
  lastLocation: string | undefined
  prefs: ReaderPrefs
  highlights: Highlight[]
  onReady(toc: TocItem[]): void
  onRelocate(detail: RelocateDetail): void
  onTap(zone: TapZone): void
  onSelection(selection: BookSelection | null): void
  onHighlightTap(cfi: string, rect: DOMRect): void
  onError(error: Error): void
}

function applyPrefs(view: View, prefs: ReaderPrefs) {
  const { renderer } = view
  renderer.setAttribute('flow', prefs.flow)
  renderer.setAttribute('gap', MARGINS[prefs.margin].gap)
  renderer.setAttribute('max-inline-size', MARGINS[prefs.margin].maxInlineSize)
  renderer.setAttribute('max-column-count', '2')
  renderer.setStyles?.(bookCss(prefs))
}

/** A rect inside a section's iframe, moved into the page's coordinates. */
function toScreen(doc: Document, rect: DOMRect): DOMRect {
  const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
  return new DOMRect(
    rect.x + (frame?.left ?? 0),
    rect.y + (frame?.top ?? 0),
    rect.width,
    rect.height,
  )
}

/**
 * Owns one `<foliate-view>` (ticket 01). Props are read through refs so the element is
 * created once per File, not on every render.
 */
export const FoliateReader = forwardRef<FoliateReaderHandle, Props>(
  function FoliateReader(props, ref) {
    const container = useRef<HTMLDivElement>(null)
    const viewRef = useRef<View | null>(null)
    const docs = useRef(new Set<Document>())
    /** Highlights currently drawn: CFI range → colour. */
    const drawn = useRef(new Map<string, string>())
    const latest = useRef(props)
    latest.current = props

    useImperativeHandle(ref, () => ({
      goTo: (target) => void viewRef.current?.goTo(target),
      goToFraction: (fraction) => void viewRef.current?.goToFraction(fraction),
      goLeft: () => void viewRef.current?.goLeft(),
      goRight: () => void viewRef.current?.goRight(),
      clearSelection: () => {
        for (const doc of docs.current) doc.getSelection()?.removeAllRanges()
      },
    }))

    useEffect(() => {
      let cancelled = false
      let view: View | null = null
      // A tap on a Highlight is reported by foliate's own click listener; remember when, so
      // the same tap doesn't also turn the page.
      let highlightTapAt = 0

      const onKey = (e: KeyboardEvent) => {
        const v = viewRef.current
        if (!v || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
        const paginated = latest.current.prefs.flow === 'paginated'
        if (e.key === 'ArrowLeft') void v.goLeft()
        else if (e.key === 'ArrowRight') void v.goRight()
        else if (paginated && (e.key === 'ArrowDown' || e.key === 'PageDown')) void v.next()
        else if (paginated && (e.key === 'ArrowUp' || e.key === 'PageUp')) void v.prev()
      }

      const attach = (doc: Document, index: number) => {
        docs.current.add(doc)
        doc.addEventListener('keydown', onKey)

        // Taps: edges turn pages, the middle toggles the chrome.
        doc.addEventListener('click', (e) => {
          if (e.defaultPrevented || e.button !== 0) return
          if (doc.getSelection()?.toString()) return
          if ((e.target as Element | null)?.closest?.('a[href]')) return
          const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
          const ratio = ((frame?.left ?? 0) + e.clientX) / window.innerWidth
          setTimeout(() => {
            if (performance.now() - highlightTapAt < 300) return
            if (latest.current.prefs.flow === 'scrolled') return latest.current.onTap('center')
            latest.current.onTap(ratio < 0.3 ? 'left' : ratio > 0.7 ? 'right' : 'center')
          })
        })

        // Selections settle before the popover shows; long-press selection on touch fires often.
        let timer: ReturnType<typeof setTimeout> | undefined
        doc.addEventListener('selectionchange', () => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            const v = viewRef.current
            const selection = doc.getSelection()
            const text = selection?.toString().trim()
            if (!v || !selection || selection.isCollapsed || !selection.rangeCount || !text)
              return latest.current.onSelection(null)
            const range = selection.getRangeAt(0)
            latest.current.onSelection({
              cfi: v.getCFI(index, range),
              text,
              rect: toScreen(doc, range.getBoundingClientRect()),
            })
          }, 250)
        })
      }

      ;(async () => {
        await import('@/vendor/foliate-js/view.js')
        const { Overlayer } = await import('@/vendor/foliate-js/overlayer.js')
        if (cancelled || !container.current) return
        view = document.createElement('foliate-view') as View
        view.style.display = 'block'
        view.style.height = '100%'
        view.addEventListener('relocate', (e) =>
          latest.current.onRelocate((e as CustomEvent<RelocateDetail>).detail),
        )
        view.addEventListener('load', (e) => {
          const { doc, index } = (e as CustomEvent<LoadDetail>).detail
          attach(doc, index)
        })
        view.addEventListener('draw-annotation', (e) => {
          const { draw, annotation } = (e as CustomEvent<DrawAnnotationDetail>).detail
          const colour = drawn.current.get(annotation.value) as Highlight['colour'] | undefined
          if (colour) draw(Overlayer.highlight, { color: HIGHLIGHT_FILL[colour] })
        })
        // Overlays are rebuilt per section, so Highlights are added again whenever one is made.
        view.addEventListener('create-overlay', () => {
          for (const value of drawn.current.keys()) void view?.addAnnotation({ value })
        })
        view.addEventListener('show-annotation', (e) => {
          const { value, range } = (e as CustomEvent<ShowAnnotationDetail>).detail
          highlightTapAt = performance.now()
          const doc = range.startContainer.ownerDocument as Document
          latest.current.onHighlightTap(value, toScreen(doc, range.getBoundingClientRect()))
        })
        container.current.append(view)
        await view.open(latest.current.file)
        if (cancelled) return
        viewRef.current = view
        applyPrefs(view, latest.current.prefs)
        await view.init({ lastLocation: latest.current.lastLocation })
        // Only after the initial navigation, so a TOC jump can't be overridden by it.
        if (cancelled) return
        for (const value of drawn.current.keys()) void view.addAnnotation({ value })
        latest.current.onReady(view.book.toc ?? [])
      })().catch((error: Error) => !cancelled && latest.current.onError(error))

      window.addEventListener('keydown', onKey)
      return () => {
        cancelled = true
        window.removeEventListener('keydown', onKey)
        docs.current.clear()
        viewRef.current = null
        view?.close()
        view?.remove()
      }
    }, [])

    useEffect(() => {
      if (viewRef.current) applyPrefs(viewRef.current, props.prefs)
    }, [props.prefs])

    // Draw only what changed: new or recoloured Highlights are (re)added, removed ones deleted.
    const { highlights } = props
    useEffect(() => {
      const view = viewRef.current
      const next = new Map(highlights.map((h) => [h.cfiRange, h.colour as string]))
      for (const value of [...drawn.current.keys()]) {
        if (next.has(value)) continue
        drawn.current.delete(value)
        void view?.deleteAnnotation({ value })
      }
      for (const [value, colour] of next) {
        if (drawn.current.get(value) === colour) continue
        drawn.current.set(value, colour)
        void view?.addAnnotation({ value })
      }
    }, [highlights])

    return <div ref={container} className="size-full" />
  },
)
