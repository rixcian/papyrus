import { act, render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { highlight } from '@/test/fixtures'
import { FakeView, resetFakeView } from '@/test/foliate'
import { FoliateReader, type FoliateReaderHandle } from './foliate-reader'
import { DEFAULT_PREFS } from './prefs'

vi.mock('@/vendor/foliate-js/view.js', () => import('@/test/foliate'))
vi.mock('@/vendor/foliate-js/overlayer.js', () => import('@/test/foliate'))

function setup(props: Partial<Parameters<typeof FoliateReader>[0]> = {}) {
  const ref = createRef<FoliateReaderHandle>()
  const handlers = {
    onReady: vi.fn(),
    onRelocate: vi.fn(),
    onTap: vi.fn(),
    onSelection: vi.fn(),
    onHighlightTap: vi.fn(),
    onFind: vi.fn(),
    onError: vi.fn(),
  }
  const base = {
    file: new Blob(['x']),
    lastLocation: 'epubcfi(/6/4!/4/2/1:0)',
    prefs: DEFAULT_PREFS,
    highlights: [highlight()],
    ...handlers,
    ...props,
  }
  const result = render(<FoliateReader ref={ref} {...base} />)
  const rerender = (next: Partial<typeof base>) =>
    result.rerender(<FoliateReader ref={ref} {...base} {...next} />)
  return { ref, ...handlers, ...result, rerender }
}

const view = () => FakeView.last as FakeView

describe('FoliateReader', () => {
  beforeEach(resetFakeView)
  afterEach(() => vi.useRealTimers())

  it('opens the File at the last location with the prefs and Highlights applied', async () => {
    const { onReady, onRelocate } = setup()
    await waitFor(() => expect(onReady).toHaveBeenCalledWith(FakeView.toc))
    expect(view().calls).toContain('init:epubcfi(/6/4!/4/2/1:0)')
    expect(view().renderer.setAttribute).toHaveBeenCalledWith('flow', 'paginated')
    expect(view().renderer.setStyles).toHaveBeenCalled()
    expect(view().annotations.has(highlight().cfiRange)).toBe(true)
    expect(onRelocate).toHaveBeenCalledWith(expect.objectContaining({ fraction: 0.1 }))
  })

  it('moves through the book on request', async () => {
    const { ref, onReady } = setup()
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    const r = ref.current as FoliateReaderHandle
    r.goTo('ch2')
    r.goToFraction(0.5)
    r.goLeft()
    r.goRight()
    r.clearSearch()
    const events = []
    for await (const e of r.search('spice')) events.push(e)
    expect(events).toEqual(['done'])
    expect(view().calls).toEqual(
      expect.arrayContaining(['goTo:ch2', 'goToFraction:0.5', 'goLeft', 'goRight', 'clearSearch']),
    )
  })

  it('turns pages with the keyboard, and Ctrl+F finds', async () => {
    const { onReady, onFind, rerender } = setup()
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    const key = (key: string, init: KeyboardEventInit = {}) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...init }))
    key('ArrowLeft')
    key('ArrowRight')
    key('ArrowDown')
    key('PageUp')
    key('ArrowLeft', { altKey: true })
    key('f', { ctrlKey: true })
    expect(onFind).toHaveBeenCalled()
    expect(view().calls.slice(-4)).toEqual(['goLeft', 'goRight', 'next', 'prev'])
    rerender({ prefs: { ...DEFAULT_PREFS, flow: 'scrolled' } })
    expect(view().renderer.setAttribute).toHaveBeenLastCalledWith('max-column-count', '2')
    key('ArrowDown')
    expect(view().calls.at(-1)).toBe('prev')
  })

  it('reports taps by zone, but not on links, selections or Highlights', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const { onReady, onTap, onHighlightTap, rerender } = setup()
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled())
    const doc = view().loadSection()
    const click = (clientX: number, target: Element = doc.body) => {
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, clientX, button: 0 }),
      )
      vi.runAllTimers()
    }
    click(10)
    click(window.innerWidth - 10)
    click(window.innerWidth / 2)
    expect(onTap.mock.calls).toEqual([['left'], ['right'], ['center']])

    click(10, doc.querySelector('a') as Element)
    doc.body.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 2 }))
    view().tapHighlight(highlight().cfiRange, doc)
    expect(onHighlightTap).toHaveBeenCalledWith(highlight().cfiRange, expect.any(DOMRect))
    click(10)
    expect(onTap).toHaveBeenCalledTimes(3)

    rerender({ prefs: { ...DEFAULT_PREFS, flow: 'scrolled' } })
    vi.advanceTimersByTime(500)
    click(10)
    expect(onTap).toHaveBeenLastCalledWith('center')

    // Keys inside the section's frame turn pages too.
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(view().calls.at(-1)).toBe('goRight')
  })

  it('reports a settled selection, and clears it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const { ref, onReady, onSelection } = setup()
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled())
    const doc = view().loadSection()
    const range = doc.createRange()
    range.selectNodeContents(doc.getElementById('text') as Element)
    // A section document has no window of its own here, so its selection is faked.
    let text = 'The spice must flow.'
    const removeAllRanges = vi.fn(() => {
      text = ''
    })
    vi.spyOn(doc, 'getSelection').mockImplementation(
      () =>
        ({
          toString: () => text,
          isCollapsed: !text,
          rangeCount: text ? 1 : 0,
          getRangeAt: () => range,
          removeAllRanges,
        }) as unknown as Selection,
    )
    doc.dispatchEvent(new Event('selectionchange'))
    vi.advanceTimersByTime(300)
    expect(onSelection).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cfi: FakeView.selectionCfi,
        text: expect.stringContaining('spice'),
      }),
    )
    // A tap while text is selected only ends the selection.
    doc.body.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))

    ref.current?.clearSelection()
    expect(removeAllRanges).toHaveBeenCalled()
    doc.dispatchEvent(new Event('selectionchange'))
    vi.advanceTimersByTime(300)
    expect(onSelection).toHaveBeenLastCalledWith(null)
  })

  it('draws only the Highlights that changed, and redraws them per section', async () => {
    const h = highlight()
    const { onReady, rerender } = setup()
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    const add = vi.spyOn(view(), 'addAnnotation')
    rerender({ highlights: [{ ...h }] })
    expect(add).not.toHaveBeenCalled()
    rerender({ highlights: [{ ...h, colour: 'blue' }] })
    expect(add).toHaveBeenCalledTimes(1)
    view().dispatchEvent(new Event('create-overlay'))
    expect(add).toHaveBeenCalledTimes(2)
    rerender({ highlights: [] })
    expect(view().annotations.size).toBe(0)
    // An annotation it didn't draw (a search match) isn't painted as a Highlight.
    const draw = vi.fn()
    view().dispatchEvent(
      new CustomEvent('draw-annotation', { detail: { draw, annotation: { value: 'x' } } }),
    )
    expect(draw).not.toHaveBeenCalled()
  })

  it('reports a book that will not open', async () => {
    FakeView.failOpen = new Error('Not an ebook')
    const { onError } = setup()
    await waitFor(() => expect(onError).toHaveBeenCalledWith(FakeView.failOpen))
  })

  it('closes the view once when it goes away', async () => {
    const { onReady, unmount } = setup()
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    const v = view()
    act(() => unmount())
    expect(v.closed).toBe(true)
    expect(v.isConnected).toBe(false)
  })

  it('stops opening when unmounted first', async () => {
    const { unmount, onReady } = setup()
    unmount()
    await new Promise((r) => setTimeout(r, 20))
    expect(onReady).not.toHaveBeenCalled()
  })
})
