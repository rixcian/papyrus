import { DEFAULT_TRANSLATE_TARGET } from '@papyrus/shared'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { syncEngine } from '@/sync'
import type { Bookmark } from '@/sync/annotations'
import { callsTo, reply, route } from '@/test/api'
import { highlight } from '@/test/fixtures'
import { renderPage, renderQueryHook } from '@/test/render'
import type { SearchEvent } from '@/vendor/foliate-js/view.js'
import {
  AnnotationsPanel,
  ColourSwatches,
  FloatingBar,
  HighlightPicker,
  NoteDialog,
} from './annotation-ui'
import { SearchPanel, type SearchState, useBookSearch } from './book-search'
import type { FoliateReaderHandle } from './foliate-reader'
import { TocList, TypographyPanel } from './panels'
import { bookCss, DEFAULT_PREFS, loadPrefs, useReaderPrefs } from './prefs'
import { TranslationCard, useTranslateTarget, useTranslationEnabled } from './translation'
import { useAnnotations } from './use-annotations'

const rect = new DOMRect(100, 300, 50, 20)

const bookmark = (overrides: Partial<Bookmark> = {}): Bookmark => ({
  kind: 'bookmark',
  profileId: 'p',
  hlc: '',
  id: 'bm1',
  fileId: 'f1',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  snippet: 'Chapter one',
  deleted: false,
  ...overrides,
})

describe('prefs', () => {
  it('loads saved prefs over the defaults, and survives junk', () => {
    expect(loadPrefs('p')).toEqual(DEFAULT_PREFS)
    localStorage.setItem('papyrus:reader-prefs:p', JSON.stringify({ fontSize: 120 }))
    expect(loadPrefs('p').fontSize).toBe(120)
    localStorage.setItem('papyrus:reader-prefs:p', '{')
    expect(loadPrefs('p')).toEqual(DEFAULT_PREFS)
  })

  it('saves changes per Profile', () => {
    const { result } = renderHook(() => useReaderPrefs('p2'))
    act(() => result.current[1]({ theme: 'sepia' }))
    expect(result.current[0].theme).toBe('sepia')
    expect(loadPrefs('p2').theme).toBe('sepia')
  })

  it('builds the book’s CSS from the prefs', () => {
    expect(bookCss(DEFAULT_PREFS)).toContain('color-scheme: dark')
    const css = bookCss({ ...DEFAULT_PREFS, theme: 'light', font: 'serif' })
    expect(css).toContain('Georgia')
    expect(css).toContain('color-scheme: light')
  })
})

describe('panels', () => {
  it('lists the contents with nesting and the current entry', async () => {
    const onPick = vi.fn()
    render(
      <TocList
        items={[
          { label: 'Part one', href: 'p1', subitems: [{ label: ' ', href: 'c1' }] },
          { label: 'Part two', href: 'p2' },
        ]}
        current="p2"
        onPick={onPick}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Untitled' }))
    expect(onPick).toHaveBeenCalledWith('c1')
  })

  it('changes typography', async () => {
    const onChange = vi.fn()
    render(
      <TypographyPanel
        prefs={{ ...DEFAULT_PREFS, fontSize: 80, lineHeight: 9 }}
        onChange={onChange}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sepia' }))
    await userEvent.click(screen.getByRole('button', { name: 'Serif' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wide' }))
    await userEvent.click(screen.getByRole('button', { name: 'Scroll' }))
    expect(screen.getByRole('button', { name: 'Decrease Size' })).toHaveProperty('disabled', true)
    await userEvent.click(screen.getByRole('button', { name: 'Increase Size' }))
    await userEvent.click(screen.getByRole('button', { name: 'Increase Line spacing' }))
    expect(onChange.mock.calls).toEqual([
      [{ theme: 'sepia' }],
      [{ font: 'serif' }],
      [{ margin: 'wide' }],
      [{ flow: 'scrolled' }],
      [{ fontSize: 90 }],
      [{ lineHeight: 1.4 }],
    ])
    render(<TypographyPanel prefs={{ ...DEFAULT_PREFS, fontSize: 200 }} onChange={onChange} />)
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Decrease Size' })[1] as HTMLElement,
    )
    expect(onChange).toHaveBeenLastCalledWith({ fontSize: 175 })
  })
})

describe('annotation UI', () => {
  it('places the floating bar above the rect, or below near the top', () => {
    const { rerender } = render(<FloatingBar rect={rect}>bar</FloatingBar>)
    expect(screen.getByText('bar').style.top).toBe('292px')
    rerender(<FloatingBar rect={new DOMRect(0, 10, 10, 10)}>bar</FloatingBar>)
    expect(screen.getByText('bar').style.top).toBe('28px')
  })

  it('picks a colour and a Highlight', async () => {
    const onPick = vi.fn()
    render(<ColourSwatches current="blue" onPick={onPick} />)
    expect(
      screen.getByRole('button', { name: 'Highlight blue' }).getAttribute('aria-pressed'),
    ).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Highlight pink' }))
    expect(onPick).toHaveBeenCalledWith('pink')

    const onHighlight = vi.fn()
    render(
      <HighlightPicker
        rect={rect}
        highlights={[highlight(), highlight({ id: 'h2', text: 'Fear' })]}
        onPick={onHighlight}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fear' }))
    expect(onHighlight).toHaveBeenCalledWith(expect.objectContaining({ id: 'h2' }))
  })

  it('edits a note', async () => {
    const onSave = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <NoteDialog
        open
        initial="old"
        quote="The spice"
        onOpenChange={onOpenChange}
        onSave={onSave}
      />,
    )
    await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), ' new')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith('old new')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('lists Highlights and Bookmarks to go to, delete and export', async () => {
    const onGo = vi.fn()
    const onDelete = vi.fn()
    const onExport = vi.fn()
    const h = highlight({ note: 'Remember this' })
    const { rerender } = render(
      <AnnotationsPanel
        entries={[
          { kind: 'highlight', item: h, cfi: h.cfiRange },
          { kind: 'bookmark', item: bookmark({ snippet: '' }), cfi: 'c' },
        ]}
        onGo={onGo}
        onExport={onExport}
        onDelete={onDelete}
      />,
    )
    expect(screen.getByText('Remember this')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Bookmark Bookmark/ }))
    expect(onGo).toHaveBeenCalledWith('c')
    await userEvent.click(screen.getByRole('button', { name: 'Delete highlight' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete bookmark' }))
    expect(onDelete).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: /Export highlights/ }))
    expect(onExport).toHaveBeenCalled()
    rerender(<AnnotationsPanel entries={[]} onGo={onGo} onExport={onExport} onDelete={onDelete} />)
    expect(screen.getByText(/Select text to highlight it/)).toBeTruthy()
  })
})

describe('useAnnotations', () => {
  it('lists live Highlights and Bookmarks in reading order, and follows changes', async () => {
    const { result } = renderHook(() => useAnnotations('p-ann', 'f1'))
    await act(async () => {
      await syncEngine.record('p-ann', {
        kind: 'highlight',
        ...strip(highlight({ id: 'h2', cfiRange: 'epubcfi(/6/6!/4/2,/1:0,/1:5)' })),
      })
      await syncEngine.record('p-ann', { kind: 'highlight', ...strip(highlight()) })
      await syncEngine.record('p-ann', { kind: 'bookmark', ...strip(bookmark()) })
      await syncEngine.record('p-ann', {
        kind: 'bookmark',
        ...strip(bookmark({ id: 'bm2', cfi: 'epubcfi(/6/2!/4/2/1:0)' })),
      })
      await syncEngine.record('p-ann', {
        kind: 'bookmark',
        ...strip(bookmark({ id: 'gone', deleted: true })),
      })
    })
    await waitFor(() => expect(result.current.highlights.map((h) => h.id)).toEqual(['h1', 'h2']))
    expect(result.current.bookmarks.map((b) => b.id)).toEqual(['bm2', 'bm1'])
  })
})

function strip<T extends { kind: string; profileId: string; hlc: string }>({
  kind: _k,
  profileId: _p,
  hlc: _h,
  ...rest
}: T) {
  return rest
}

function useSearch(reader: FoliateReaderHandle | null) {
  const ref = useRef(reader)
  ref.current = reader
  return useBookSearch(ref)
}

describe('book search', () => {
  function handle(events: () => AsyncGenerator<SearchEvent>) {
    return { search: vi.fn(events), clearSearch: vi.fn() } as unknown as FoliateReaderHandle
  }

  it('streams matches by section and finishes', async () => {
    const reader = handle(async function* () {
      yield { progress: 0.5 }
      yield {
        label: 'Chapter 1',
        subitems: [{ cfi: 'c1', excerpt: { pre: 'a ', match: 'spice', post: ' b' } }],
      }
      yield 'done'
    })
    const { result } = renderHook(() => useSearch(reader))
    act(() => result.current.start('  spice '))
    await waitFor(() => expect(result.current.state.status).toBe('done'))
    expect(result.current.state.groups[0]?.label).toBe('Chapter 1')
    expect(result.current.state.query).toBe('spice')
    act(() => result.current.clear())
    expect(result.current.state.status).toBe('idle')
    await waitFor(() => expect(reader.clearSearch).toHaveBeenCalledTimes(2))
  })

  it('cancels, replaces a running search, and reports failures', async () => {
    let release: () => void = () => {}
    const reader = handle(async function* () {
      yield { progress: 0.1 }
      await new Promise<void>((r) => (release = r))
      yield 'done'
    })
    const { result, unmount } = renderHook(() => useSearch(reader))
    act(() => result.current.start('spice'))
    await waitFor(() => expect(result.current.state.progress).toBe(0.1))
    act(() => result.current.cancel())
    expect(result.current.state.status).toBe('cancelled')
    act(() => result.current.cancel())
    act(() => release())

    act(() => result.current.start('first'))
    act(() => result.current.start(''))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    const failing = handle(async function* () {
      yield* []
      throw new Error('boom')
    })
    const second = renderHook(() => useSearch(failing))
    act(() => second.result.current.start('x'))
    await waitFor(() => expect(second.result.current.state.status).toBe('failed'))
    unmount()
  })

  it('does nothing before the book is open', async () => {
    const { result } = renderHook(() => useSearch(null))
    act(() => result.current.start('spice'))
    await waitFor(() => expect(result.current.state.status).toBe('searching'))
  })

  it('shows each stage of a search', async () => {
    const onSearch = vi.fn()
    const onClear = vi.fn()
    const onPick = vi.fn()
    const onCancel = vi.fn()
    const base: SearchState = { query: 'spice', status: 'searching', progress: 0.42, groups: [] }
    const props = { onSearch, onCancel, onClear, onPick }
    const { rerender } = render(<SearchPanel state={{ ...base, query: '' }} {...props} />)
    const input = screen.getByLabelText('Search in this book')
    await userEvent.type(input, 'spice{enter}')
    expect(onSearch).toHaveBeenCalledWith('spice')
    await userEvent.clear(input)
    expect(onClear).toHaveBeenCalled()

    rerender(<SearchPanel state={base} {...props} />)
    expect(screen.getByText('Searching… 42% · 0 results')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()

    const groups = [
      {
        label: 'Ch 1',
        matches: [{ cfi: 'c1', excerpt: { pre: 'a ', match: 'spice', post: ' b' } }],
      },
      { label: '', matches: [{ cfi: 'c2', excerpt: { pre: '', match: 'spice', post: '' } }] },
    ]
    rerender(<SearchPanel state={{ ...base, status: 'done', groups }} {...props} />)
    expect(screen.getByText('2 results')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'a spice b' }))
    expect(onPick).toHaveBeenCalledWith('c1')
    rerender(
      <SearchPanel state={{ ...base, status: 'done', groups: [groups[0] as never] }} {...props} />,
    )
    expect(screen.getByText('1 result')).toBeTruthy()
    rerender(<SearchPanel state={{ ...base, status: 'done' }} {...props} />)
    expect(screen.getByText('Nothing found for “spice”')).toBeTruthy()
    rerender(<SearchPanel state={{ ...base, status: 'cancelled' }} {...props} />)
    expect(screen.getByText('Stopped at 42% · 0 results')).toBeTruthy()
    rerender(<SearchPanel state={{ ...base, status: 'failed' }} {...props} />)
    expect(screen.getByText(/stopped with an error/)).toBeTruthy()
  })
})

function TranslatedCard({ onClose }: { onClose: () => void }) {
  const [target, setTarget] = useTranslateTarget('p-tr')
  return (
    <TranslationCard
      text={'x'.repeat(5001)}
      rect={rect}
      target={target}
      onTargetChange={setTarget}
      onClose={onClose}
    />
  )
}

describe('translation', () => {
  it('remembers the target language per Profile', () => {
    localStorage.setItem('papyrus:translate-to:p', 'junk')
    const { result } = renderHook(() => useTranslateTarget('p'))
    expect(result.current[0]).toBe(DEFAULT_TRANSLATE_TARGET)
    act(() => result.current[1]('DE'))
    expect(renderHook(() => useTranslateTarget('p')).result.current[0]).toBe('DE')
  })

  it('knows whether the server translates', async () => {
    route('GET /api/translate/status', { enabled: true })
    const { result } = renderQueryHook(() => useTranslationEnabled())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('translates the selection, switches language and copies the result', async () => {
    route('POST /api/translate', ({ body }) => ({
      text: `[${(body as { target: string }).target}] Hallo`,
      detectedSource: 'EN',
    }))
    const onClose = vi.fn()
    const { user } = renderPage(<TranslatedCard onClose={onClose} />)
    // After userEvent.setup, which puts its own clipboard in place.
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    expect(screen.getByText('Translating…')).toBeTruthy()
    expect(await screen.findByText(`[${DEFAULT_TRANSLATE_TARGET}] Hallo`)).toBeTruthy()
    expect(screen.getByText('English →')).toBeTruthy()
    expect(screen.getByText(/Only the first .+ characters were translated/)).toBeTruthy()
    expect(callsTo('POST /api/translate')[0]?.body).toMatchObject({ text: 'x'.repeat(5000) })
    await user.selectOptions(screen.getByLabelText('Translate to'), 'DE')
    expect(await screen.findByText('[DE] Hallo')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('[DE] Hallo')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Close translation' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows translation errors and an unknown source language', async () => {
    route('POST /api/translate', reply(502, { error: 'x', message: 'DeepL is down' }))
    renderPage(
      <TranslationCard
        text="Hi"
        rect={new DOMRect(0, 700, 10, 10)}
        target="DE"
        onTargetChange={() => {}}
        onClose={() => {}}
      />,
    )
    expect(await screen.findByText('DeepL is down')).toBeTruthy()
  })

  it('shows a source language code it cannot name', async () => {
    route('POST /api/translate', { text: 'Hallo', detectedSource: '??' })
    renderPage(
      <TranslationCard
        text="Hi"
        rect={rect}
        target="DE"
        onTargetChange={() => {}}
        onClose={() => {}}
      />,
    )
    expect(await screen.findByText('?? →')).toBeTruthy()
  })
})
