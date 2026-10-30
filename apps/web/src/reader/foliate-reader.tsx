import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { LoadDetail, RelocateDetail, TocItem, View } from '@/vendor/foliate-js/view.js'
import { bookCss, MARGINS, type ReaderPrefs } from './prefs'

export type TapZone = 'left' | 'center' | 'right'

export interface FoliateReaderHandle {
  goTo(target: string): void
  goToFraction(fraction: number): void
  goLeft(): void
  goRight(): void
}

interface Props {
  file: Blob
  lastLocation: string | undefined
  prefs: ReaderPrefs
  onReady(toc: TocItem[]): void
  onRelocate(detail: RelocateDetail): void
  onTap(zone: TapZone): void
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

/**
 * Owns one `<foliate-view>` (ticket 01). Props are read through refs so the element is
 * created once per File, not on every render.
 */
export const FoliateReader = forwardRef<FoliateReaderHandle, Props>(
  function FoliateReader(props, ref) {
    const container = useRef<HTMLDivElement>(null)
    const viewRef = useRef<View | null>(null)
    const latest = useRef(props)
    latest.current = props

    useImperativeHandle(ref, () => ({
      goTo: (target) => void viewRef.current?.goTo(target),
      goToFraction: (fraction) => void viewRef.current?.goToFraction(fraction),
      goLeft: () => void viewRef.current?.goLeft(),
      goRight: () => void viewRef.current?.goRight(),
    }))

    useEffect(() => {
      let cancelled = false
      let view: View | null = null

      const onKey = (e: KeyboardEvent) => {
        const v = viewRef.current
        if (!v || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
        if (e.key === 'ArrowLeft') void v.goLeft()
        else if (e.key === 'ArrowRight') void v.goRight()
        else if (
          latest.current.prefs.flow === 'paginated' &&
          (e.key === 'ArrowDown' || e.key === 'PageDown')
        )
          void v.next()
        else if (
          latest.current.prefs.flow === 'paginated' &&
          (e.key === 'ArrowUp' || e.key === 'PageUp')
        )
          void v.prev()
      }

      // Taps inside a section: edges turn pages, the middle toggles the chrome.
      const attach = (doc: Document) => {
        doc.addEventListener('keydown', onKey)
        doc.addEventListener('click', (e) => {
          if (e.defaultPrevented || e.button !== 0) return
          if (doc.getSelection()?.toString()) return
          if ((e.target as Element | null)?.closest?.('a[href]')) return
          const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
          const x = (frame?.left ?? 0) + e.clientX
          const ratio = x / window.innerWidth
          if (latest.current.prefs.flow === 'scrolled') return latest.current.onTap('center')
          latest.current.onTap(ratio < 0.3 ? 'left' : ratio > 0.7 ? 'right' : 'center')
        })
      }

      ;(async () => {
        await import('@/vendor/foliate-js/view.js')
        if (cancelled || !container.current) return
        view = document.createElement('foliate-view') as View
        view.style.display = 'block'
        view.style.height = '100%'
        view.addEventListener('relocate', (e) =>
          latest.current.onRelocate((e as CustomEvent<RelocateDetail>).detail),
        )
        view.addEventListener('load', (e) => attach((e as CustomEvent<LoadDetail>).detail.doc))
        container.current.append(view)
        await view.open(latest.current.file)
        if (cancelled) return
        viewRef.current = view
        applyPrefs(view, latest.current.prefs)
        latest.current.onReady(view.book.toc ?? [])
        await view.init({ lastLocation: latest.current.lastLocation })
      })().catch((error: Error) => !cancelled && latest.current.onError(error))

      window.addEventListener('keydown', onKey)
      return () => {
        cancelled = true
        window.removeEventListener('keydown', onKey)
        viewRef.current = null
        view?.close()
        view?.remove()
      }
    }, [])

    useEffect(() => {
      if (viewRef.current) applyPrefs(viewRef.current, props.prefs)
    }, [props.prefs])

    return <div ref={container} className="size-full" />
  },
)
