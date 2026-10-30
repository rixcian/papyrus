import { CheckIcon, EllipsisIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { Facet, LibraryQuery } from '@/lib/books'
import { useFacets } from '@/lib/books'
import {
  type Shelf,
  useCreateShelf,
  useDeleteShelf,
  useRenameShelf,
  useShelves,
} from '@/lib/shelves'
import { cn } from '@/lib/utils'
import type { ReadStatus } from '@/sync'
import { ConfirmDialog } from './confirm-dialog'
import { ShelfNameDialog } from './shelf-dialogs'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Menu, MenuItem, MenuPopup, MenuTrigger } from './ui/menu'

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
  const hidden = query.hidden === 'true'
  const scopes = [
    {
      label: 'All',
      selected: !query.scope && !hidden,
      patch: { scope: undefined, hidden: undefined },
    },
    {
      label: 'Mine',
      selected: query.scope === 'mine',
      patch: { scope: 'mine', hidden: undefined },
    },
    {
      label: 'Shared with me',
      selected: query.scope === 'shared',
      patch: { scope: 'shared', hidden: undefined },
    },
    ...(facets.data?.hidden || hidden
      ? [{ label: 'Hidden', selected: hidden, patch: { scope: undefined, hidden: 'true' } }]
      : []),
  ] as const satisfies { label: string; selected: boolean; patch: Partial<LibraryQuery> }[]
  // Only worth offering once something is Shared with this Profile (ticket 06).
  const showScopes = Boolean(facets.data?.shared || facets.data?.hidden || query.scope || hidden)
  return (
    <div className="flex flex-col gap-6">
      {showScopes && (
        <section>
          <h2 className="mb-1.5 px-2 font-medium text-muted-foreground text-xs">Show</h2>
          <ul>
            {scopes.map((s) => (
              <li key={s.label}>
                <FilterButton selected={s.selected} onClick={() => onChange(s.patch)}>
                  {s.label}
                </FilterButton>
              </li>
            ))}
          </ul>
        </section>
      )}
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
      <ShelfList selected={query.shelf} onSelect={(shelf) => onChange({ shelf })} />
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

/** The Profile's shelves: pick one to filter by, and create, rename or delete them. */
function ShelfList({
  selected,
  onSelect,
}: {
  selected: string | undefined
  onSelect: (shelfId: string | undefined) => void
}) {
  const shelves = useShelves()
  const create = useCreateShelf()
  const [creating, setCreating] = useState(false)
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-2">
        <h2 className="font-medium text-muted-foreground text-xs">Shelves</h2>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="New shelf"
          onClick={() => setCreating(true)}
        >
          <PlusIcon />
        </Button>
      </div>
      <ul>
        {(shelves.data ?? []).map((shelf) => (
          <ShelfRow
            key={shelf.id}
            shelf={shelf}
            selected={selected === shelf.id}
            onSelect={() => onSelect(selected === shelf.id ? undefined : shelf.id)}
            onDeleted={() => selected === shelf.id && onSelect(undefined)}
          />
        ))}
        {shelves.data?.length === 0 && (
          <li className="px-2 py-1 text-muted-foreground text-sm">No shelves yet</li>
        )}
      </ul>
      {creating && (
        <ShelfNameDialog
          open={creating}
          onOpenChange={setCreating}
          title="New shelf"
          submitLabel="Create"
          onSubmit={(name) => create.mutateAsync(name)}
        />
      )}
    </section>
  )
}

function ShelfRow({
  shelf,
  selected,
  onSelect,
  onDeleted,
}: {
  shelf: Shelf
  selected: boolean
  onSelect: () => void
  onDeleted: () => void
}) {
  const rename = useRenameShelf()
  const remove = useDeleteShelf()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return (
    <li className="group flex items-center">
      <div className="min-w-0 flex-1">
        <FilterButton selected={selected} onClick={onSelect} count={shelf.count}>
          {shelf.name}
        </FilterButton>
      </div>
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`${shelf.name}: shelf actions`}
              className="opacity-60 group-hover:opacity-100"
            />
          }
        >
          <EllipsisIcon />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem onClick={() => setRenaming(true)}>Rename</MenuItem>
          <MenuItem variant="destructive" onClick={() => setDeleting(true)}>
            Delete
          </MenuItem>
        </MenuPopup>
      </Menu>
      {renaming && (
        <ShelfNameDialog
          open={renaming}
          onOpenChange={setRenaming}
          title="Rename shelf"
          initial={shelf.name}
          submitLabel="Rename"
          onSubmit={(name) => rename.mutateAsync({ shelfId: shelf.id, name })}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete the shelf “${shelf.name}”?`}
        description="The Books on it stay in your library."
        confirmLabel="Delete shelf"
        onConfirm={async () => {
          await remove.mutateAsync(shelf.id)
          onDeleted()
        }}
      />
    </li>
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
