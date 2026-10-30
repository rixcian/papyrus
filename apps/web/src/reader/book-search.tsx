import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import type { SearchMatch } from '@/vendor/foliate-js/view.js'
import type { FoliateReaderHandle } from './foliate-reader'

export interface SearchState {
  query: string
  status: 'idle' | 'searching' | 'done' | 'cancelled' | 'failed'
  /** Fraction of the book's sections searched so far. */
  progress: number
  /** Matches per section, in reading order, as they stream in. */
  groups: { label: string; matches: SearchMatch[] }[]
}

const IDLE: SearchState = { query: '', status: 'idle', progress: 0, groups: [] }

/**
 * In-book search on foliate-js (ticket 12). Lives in the Reader, not the panel, so results
 * and their outlines on the page survive closing the panel to read a match.
 */
export function useBookSearch(reader: RefObject<FoliateReaderHandle | null>) {
  const [state, setState] = useState<SearchState>(IDLE)
  /** Bumped to cancel: a running search stops at its next section. */
  const run = useRef(0)
  /**
   * The running search, so the next one starts only after it has stopped. foliate draws a
   * section's matches before handing them over, so a stale search left running could draw
   * over the new one's results.
   */
  const running = useRef<Promise<void>>(Promise.resolve())

  const start = useCallback(
    (input: string) => {
      const id = ++run.current
      const query = input.trim()
      const previous = running.current
      running.current = (async () => {
        await previous
        if (run.current !== id) return
        reader.current?.clearSearch()
        if (!query) return setState(IDLE)
        setState({ query, status: 'searching', progress: 0, groups: [] })
        const handle = reader.current
        if (!handle) return
        try {
          for await (const event of handle.search(query)) {
            if (run.current !== id) return
            if (event === 'done') setState((s) => ({ ...s, status: 'done', progress: 1 }))
            else if ('progress' in event) setState((s) => ({ ...s, progress: event.progress }))
            else
              setState((s) => ({
                ...s,
                groups: [...s.groups, { label: event.label, matches: event.subitems }],
              }))
          }
        } catch {
          if (run.current === id) setState((s) => ({ ...s, status: 'failed' }))
        }
      })()
    },
    [reader],
  )

  const cancel = useCallback(() => {
    run.current++
    setState((s) => (s.status === 'searching' ? { ...s, status: 'cancelled' } : s))
  }, [])

  const clear = useCallback(() => {
    run.current++
    setState(IDLE)
    running.current = running.current.then(() => reader.current?.clearSearch())
  }, [reader])

  useEffect(
    () => () => {
      run.current++
    },
    [],
  )

  return { state, start, cancel, clear }
}

export function SearchPanel({
  state,
  onSearch,
  onCancel,
  onClear,
  onPick,
}: {
  state: SearchState
  onSearch: (query: string) => void
  onCancel: () => void
  onClear: () => void
  onPick: (cfi: string) => void
}) {
  const [draft, setDraft] = useState(state.query)
  const count = state.groups.reduce((n, g) => n + g.matches.length, 0)
  const percent = Math.round(state.progress * 100)
  const found = `${count} ${count === 1 ? 'result' : 'results'}`

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onSearch(draft)
        }}
      >
        <Input
          type="search"
          aria-label="Search in this book"
          placeholder="Search in this book"
          value={draft}
          autoFocus
          onChange={(e) => {
            setDraft(e.target.value)
            if (!e.target.value) onClear()
          }}
        />
        <Button type="submit" disabled={!draft.trim()}>
          Search
        </Button>
      </form>

      {state.status === 'searching' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span role="status">
              Searching… {percent}% · {found}
            </span>
            <Button size="xs" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
          <Progress value={percent} aria-label="Search progress" />
        </div>
      )}
      {state.status === 'done' && (
        <p role="status" className="text-muted-foreground text-sm">
          {count ? found : `Nothing found for “${state.query}”`}
        </p>
      )}
      {state.status === 'cancelled' && (
        <p role="status" className="text-muted-foreground text-sm">
          Stopped at {percent}% · {found}
        </p>
      )}
      {state.status === 'failed' && (
        <p role="status" className="text-destructive-foreground text-sm">
          The search stopped with an error · {found}
        </p>
      )}

      {state.groups.map((group, i) => (
        // Sections without a TOC entry share a label, so the position is part of the key.
        // biome-ignore lint/suspicious/noArrayIndexKey: groups only ever append
        <section key={i}>
          {group.label && (
            <h3 className="mb-1 px-2 font-medium text-muted-foreground text-xs">{group.label}</h3>
          )}
          <ul>
            {group.matches.map((m) => (
              <li key={m.cfi}>
                <button
                  type="button"
                  onClick={() => onPick(m.cfi)}
                  className="w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent"
                >
                  {m.excerpt.pre}
                  <mark className="rounded-sm bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">
                    {m.excerpt.match}
                  </mark>
                  {m.excerpt.post}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
