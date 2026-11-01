import { vi } from 'vitest'
import type { SearchEvent, TocItem } from '@/vendor/foliate-js/view.js'

/**
 * Stands in for foliate-js's `<foliate-view>`, which needs real layout. Mock the vendored
 * modules with this file; tests drive the view through `FakeView.last`.
 */
export class FakeView extends HTMLElement {
  static last: FakeView | null = null
  static toc: TocItem[] = [{ label: 'Chapter 1', href: 'ch1.xhtml' }]
  static failOpen: Error | null = null
  static searchEvents: SearchEvent[] = ['done']
  /** CFI `getCFI` returns for a selection. */
  static selectionCfi = 'epubcfi(/6/4!/4/2,/1:0,/1:10)'

  renderer = { setAttribute: vi.fn(), setStyles: vi.fn() }
  book = { toc: FakeView.toc }
  calls: string[] = []
  annotations = new Set<string>()
  closed = false

  constructor() {
    super()
    FakeView.last = this
  }

  async open(_file: Blob) {
    if (FakeView.failOpen) throw FakeView.failOpen
  }
  async init({ lastLocation }: { lastLocation?: string }) {
    this.calls.push(`init:${lastLocation ?? ''}`)
    this.relocate(lastLocation ?? 'epubcfi(/6/2!/4/2/1:0)', 0.1)
  }
  /** Moves to a location, as turning pages or following a link does. */
  relocate(cfi: string, fraction: number, extra: object = {}) {
    this.dispatchEvent(
      new CustomEvent('relocate', {
        detail: { cfi, fraction, tocItem: { label: ' Chapter 1 ', href: 'ch1.xhtml' }, ...extra },
      }),
    )
  }
  async goTo(target: string) {
    this.calls.push(`goTo:${target}`)
  }
  async goToFraction(fraction: number) {
    this.calls.push(`goToFraction:${fraction}`)
  }
  async goLeft() {
    this.calls.push('goLeft')
  }
  async goRight() {
    this.calls.push('goRight')
  }
  async next() {
    this.calls.push('next')
  }
  async prev() {
    this.calls.push('prev')
  }
  async *search(_opts: { query: string }) {
    for (const event of FakeView.searchEvents) yield event
  }
  clearSearch() {
    this.calls.push('clearSearch')
  }
  async addAnnotation({ value }: { value: string }) {
    this.annotations.add(value)
    // foliate asks the page how to draw each one it adds.
    this.dispatchEvent(
      new CustomEvent('draw-annotation', { detail: { draw: vi.fn(), annotation: { value } } }),
    )
  }
  async deleteAnnotation({ value }: { value: string }) {
    this.annotations.delete(value)
  }
  getCFI() {
    return FakeView.selectionCfi
  }
  close() {
    this.closed = true
  }

  /** A section document loaded into the view. */
  loadSection(index = 0) {
    const doc = document.implementation.createHTMLDocument('section')
    doc.body.innerHTML = '<p id="text">The spice must flow. <a href="#n1">1</a></p>'
    this.dispatchEvent(new CustomEvent('load', { detail: { doc, index } }))
    return doc
  }

  /**
   * Selects `text` in a section and lets the selection settle. A section document has no
   * window of its own here, so its selection is faked.
   */
  select(doc: Document, text: string) {
    const range = doc.createRange()
    range.selectNodeContents(doc.body)
    let current = text
    vi.spyOn(doc, 'getSelection').mockImplementation(
      () =>
        ({
          toString: () => current,
          isCollapsed: !current,
          rangeCount: current ? 1 : 0,
          getRangeAt: () => range,
          removeAllRanges: () => {
            current = ''
          },
        }) as unknown as Selection,
    )
    doc.dispatchEvent(new Event('selectionchange'))
  }

  /** A tap on a Highlight, as foliate's own click listener reports it. */
  tapHighlight(value: string, doc: Document) {
    const range = doc.createRange()
    range.selectNodeContents(doc.body)
    this.dispatchEvent(new CustomEvent('show-annotation', { detail: { value, range } }))
  }
}

if (!customElements.get('foliate-view')) customElements.define('foliate-view', FakeView)

export const Overlayer = { highlight: 'highlight' }

export function resetFakeView() {
  FakeView.last = null
  FakeView.failOpen = null
  FakeView.toc = [{ label: 'Chapter 1', href: 'ch1.xhtml' }]
  FakeView.searchEvents = ['done']
  FakeView.selectionCfi = 'epubcfi(/6/4!/4/2,/1:0,/1:10)'
}
