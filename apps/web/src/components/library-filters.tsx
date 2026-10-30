import { CheckIcon } from 'lucide-react'
import { useState } from 'react'
import type { Facet, LibraryQuery } from '@/lib/books'
import { useFacets } from '@/lib/books'
import { cn } from '@/lib/utils'
import type { ReadStatus } from '@/sync'
import { Input } from './ui/input'

const STATUSES: { value: ReadStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
]

/** Lists longer than this get a box to narrow them down. */
const SEARCHABLE_FROM = 8

/** Read Status, authors, series and tags; the sidebar on desktop, a sheet on mobile (ticket 10). */
export function LibraryFilters({
  query,
  onChange,
}: {
  query: LibraryQuery
  onChange: (patch: Partial<LibraryQuery>) => void
}) {
  const facets = useFacets()
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-1.5 px-2 font-medium text-muted-foreground text-xs">Read Status</h2>
        <ul>
          {STATUSES.map((s) => (
            <li key={s.label}>
              <FilterButton
                selected={query.status === s.value}
                onClick={() => onChange({ status: s.value })}
              >
                {s.label}
              </FilterButton>
            </li>
          ))}
        </ul>
      </section>
      {facets.data && (
        <>
          <FacetList
            title="Authors"
            facets={facets.data.authors}
            selected={query.author}
            onSelect={(author) => onChange({ author })}
          />
          <FacetList
            title="Series"
            facets={facets.data.series}
            selected={query.series}
            onSelect={(series) => onChange({ series })}
          />
          <FacetList
            title="Tags"
            facets={facets.data.tags}
            selected={query.tag}
            onSelect={(tag) => onChange({ tag })}
          />
        </>
      )}
    </div>
  )
}

function FacetList({
  title,
  facets,
  selected,
  onSelect,
}: {
  title: string
  facets: Facet[]
  selected: string | undefined
  onSelect: (name: string | undefined) => void
}) {
  const [filter, setFilter] = useState('')
  if (facets.length === 0) return null
  const needle = filter.trim().toLocaleLowerCase()
  const shown = needle ? facets.filter((f) => f.name.toLocaleLowerCase().includes(needle)) : facets
  return (
    <section>
      <h2 className="mb-1.5 px-2 font-medium text-muted-foreground text-xs">{title}</h2>
      {facets.length >= SEARCHABLE_FROM && (
        <Input
          size="sm"
          type="search"
          placeholder={`Filter ${title.toLowerCase()}`}
          aria-label={`Filter ${title.toLowerCase()}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-1.5"
        />
      )}
      <ul className="max-h-64 overflow-y-auto">
        {shown.map((f) => (
          <li key={f.name}>
            <FilterButton
              selected={selected === f.name}
              onClick={() => onSelect(selected === f.name ? undefined : f.name)}
              count={f.count}
            >
              {f.name}
            </FilterButton>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-2 py-1 text-muted-foreground text-sm">No matches</li>
        )}
      </ul>
    </section>
  )
}

function FilterButton({
  selected,
  onClick,
  count,
  children,
}: {
  selected: boolean
  onClick: () => void
  count?: number
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent',
        selected && 'bg-accent font-medium',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected ? (
        <CheckIcon className="size-4 shrink-0" />
      ) : (
        count !== undefined && <span className="text-muted-foreground text-xs">{count}</span>
      )}
    </button>
  )
}
