import {
  CheckIcon,
  ChevronDownIcon,
  EllipsisIcon,
  EyeIcon,
  HeadphonesIcon,
  LayersIcon,
  LibraryBigIcon,
  type LucideIcon,
  PlusIcon,
  TagIcon,
  UserIcon,
  XIcon,
} from 'lucide-react'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
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
import { Popover, PopoverPopup, PopoverTrigger } from './ui/popover'

const STATUSES: { value: ReadStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
]

/** Lists longer than this get a box to narrow them down. */
const SEARCHABLE_FROM = 8

/**
 * Who a Book belongs to: All, Mine, Shared with me, and Hidden once anything is. Only worth
 * offering once something is Shared with this Profile (ticket 06).
 */
function useScopes(query: LibraryQuery) {
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
  const showScopes = Boolean(facets.data?.shared || facets.data?.hidden || query.scope || hidden)
  return { scopes, showScopes }
}

/** Every filter as lists, top to bottom: the phone's Filters sheet (ticket 10). */
export function LibraryFilters({
  query,
  onChange,
}: {
  query: LibraryQuery
  onChange: (patch: Partial<LibraryQuery>) => void
}) {
  const facets = useFacets()
  const { scopes, showScopes } = useScopes(query)
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
      {(facets.data?.audio || query.audio) && (
        <section>
          <h2 className="mb-1.5 px-2 font-medium text-muted-foreground text-xs">Format</h2>
          <ul>
            <li>
              <FilterButton
                selected={query.audio === 'true'}
                onClick={() => onChange({ audio: query.audio ? undefined : 'true' })}
              >
                Has audio
              </FilterButton>
            </li>
          </ul>
        </section>
      )}
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

/**
 * Desktop: every filter in one row. Read Status is a sliding switch and Has audio a toggle;
 * the rest are chips that open a short list. A chosen filter fills the chip and gets an ×.
 */
export function FilterChips({
  query,
  onChange,
}: {
  query: LibraryQuery
  onChange: (patch: Partial<LibraryQuery>) => void
}) {
  const facets = useFacets()
  const shelves = useShelves()
  const { scopes, showScopes } = useScopes(query)
  const shelfName = shelves.data?.find((s) => s.id === query.shelf)?.name
  const scope = scopes.find((s) => s.selected && s.label !== 'All')
  const facetChip = (
    key: 'author' | 'series' | 'tag',
    label: string,
    title: string,
    icon: LucideIcon,
    list: Facet[] | undefined,
  ) =>
    list && (list.length > 0 || query[key]) ? (
      <FilterChip
        key={key}
        label={label}
        icon={icon}
        value={query[key]}
        onClear={() => onChange({ [key]: undefined })}
      >
        {(close) => (
          <FacetList
            title={title}
            facets={list}
            selected={query[key]}
            onSelect={(name) => {
              onChange({ [key]: name })
              close()
            }}
          />
        )}
      </FilterChip>
    ) : null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusSwitch value={query.status} onChange={(status) => onChange({ status })} />
      {(facets.data?.audio || query.audio) && (
        <button
          type="button"
          aria-pressed={query.audio === 'true'}
          onClick={() => onChange({ audio: query.audio ? undefined : 'true' })}
          className={chipClass(query.audio === 'true')}
        >
          <HeadphonesIcon />
          Has audio
        </button>
      )}
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {facetChip('author', 'Author', 'Authors', UserIcon, facets.data?.authors)}
      {facetChip('series', 'Series', 'Series', LayersIcon, facets.data?.series)}
      {facetChip('tag', 'Tag', 'Tags', TagIcon, facets.data?.tags)}
      <FilterChip
        label="Shelf"
        icon={LibraryBigIcon}
        value={query.shelf ? (shelfName ?? 'Shelf') : undefined}
        onClear={() => onChange({ shelf: undefined })}
      >
        {(close) => (
          <ShelfList
            selected={query.shelf}
            onSelect={(shelf) => {
              onChange({ shelf })
              close()
            }}
          />
        )}
      </FilterChip>
      {showScopes && (
        <FilterChip
          label="Show"
          icon={EyeIcon}
          value={scope?.label}
          bare
          clearLabel={scope?.label === 'Hidden' ? 'Clear hidden filter' : 'Clear scope filter'}
          onClear={() => onChange({ scope: undefined, hidden: undefined })}
        >
          {(close) => (
            <ul>
              {scopes.map((s) => (
                <li key={s.label}>
                  <FilterButton
                    selected={s.selected}
                    onClick={() => {
                      onChange(s.patch)
                      close()
                    }}
                  >
                    {s.label}
                  </FilterButton>
                </li>
              ))}
            </ul>
          )}
        </FilterChip>
      )}
    </div>
  )
}

const chipClass = (on: boolean) =>
  cn(
    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 font-medium text-sm transition-[background-color,color,border-color,scale] duration-200 active:scale-[0.97] [&_svg]:size-4 [&_svg]:opacity-75',
    on
      ? 'border-transparent bg-primary text-primary-foreground [&_svg]:opacity-100'
      : 'border-input bg-transparent hover:bg-accent',
  )

/** A chip opening a list; once a value is chosen it reads "Label: value" with an ×. */
function FilterChip({
  label,
  icon: Icon,
  value,
  onClear,
  clearLabel = `Clear ${label.toLowerCase()} filter`,
  bare = false,
  children,
}: {
  label: string
  icon: LucideIcon
  value: string | undefined
  onClear: () => void
  clearLabel?: string
  /** Show only the value when chosen, not "Label: value". */
  bare?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const on = value !== undefined
  return (
    <span className={cn(chipClass(on), 'gap-0 p-0')}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'flex h-full items-center gap-1.5 rounded-full ps-3.5',
            on ? 'pe-1' : 'pe-3',
          )}
        >
          <Icon />
          {on ? (bare ? value : `${label}: ${value}`) : label}
          {!on && <ChevronDownIcon className="size-3.5!" />}
        </PopoverTrigger>
        <PopoverPopup
          align="start"
          sideOffset={8}
          className="w-72 [&_[data-slot=popover-viewport]]:p-2"
        >
          <div className="max-h-80 overflow-y-auto">{children(() => setOpen(false))}</div>
        </PopoverPopup>
      </Popover>
      {on && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={onClear}
          className="me-1.5 grid size-6 place-items-center rounded-full hover:bg-black/10"
        >
          <XIcon className="size-3.5!" />
        </button>
      )}
    </span>
  )
}

const STATUS_ORDER = STATUSES

/** Read Status as a segmented switch whose highlight slides to the choice. */
function StatusSwitch({
  value,
  onChange,
}: {
  value: ReadStatus | undefined
  onChange: (status: ReadStatus | undefined) => void
}) {
  const group = useRef<HTMLFieldSetElement>(null)
  const [mark, setMark] = useState<{ left: number; width: number } | null>(null)
  const index = STATUS_ORDER.findIndex((s) => s.value === value)
  useLayoutEffect(() => {
    const el = group.current
    if (!el) return
    const measure = () => {
      const button = el.querySelectorAll('button')[index]
      setMark(button ? { left: button.offsetLeft, width: button.offsetWidth } : null)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [index])
  return (
    <fieldset ref={group} className="relative flex rounded-full border bg-muted p-0.5">
      <legend className="sr-only">Read Status</legend>
      {mark && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 rounded-full bg-primary transition-[translate,width] duration-500 ease-spring"
          style={{ width: mark.width, translate: `${mark.left}px 0` }}
        />
      )}
      {STATUS_ORDER.map((s) => (
        <button
          key={s.label}
          type="button"
          aria-pressed={s.value === value}
          onClick={() => onChange(s.value)}
          className="relative h-8 rounded-full px-3.5 font-medium text-muted-foreground text-sm transition-colors duration-300 hover:text-foreground aria-pressed:text-primary-foreground"
        >
          {s.label}
        </button>
      ))}
    </fieldset>
  )
}

/**
 * Phones: shelves as tabs, All books first and New shelf last; the highlight slides under the
 * one shown. Every other filter is in the Filters sheet.
 */
export function ShelfTabs({
  selected,
  onSelect,
}: {
  selected: string | undefined
  onSelect: (shelfId: string | undefined) => void
}) {
  const shelves = useShelves()
  const create = useCreateShelf()
  const [creating, setCreating] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const [mark, setMark] = useState<{ left: number; width: number } | null>(null)
  const tabs = [{ id: undefined, name: 'All books' }, ...(shelves.data ?? [])]
  const index = tabs.findIndex((t) => t.id === selected)
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const measure = () => {
      const tab = el.querySelectorAll<HTMLElement>('[role="tab"]')[index]
      setMark(tab ? { left: tab.offsetLeft, width: tab.offsetWidth } : null)
      tab?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [index])
  return (
    <div
      ref={list}
      role="tablist"
      aria-label="Shelves"
      className="relative -mx-4 flex overflow-x-auto border-b px-4 [scrollbar-width:none]"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id ?? 'all'}
          type="button"
          role="tab"
          aria-selected={tab.id === selected}
          onClick={() => onSelect(tab.id)}
          className="h-11 shrink-0 px-3 font-medium text-muted-foreground text-sm transition-colors duration-300 aria-selected:text-foreground"
        >
          {tab.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex h-11 shrink-0 items-center gap-1 px-3 text-muted-foreground text-sm"
      >
        <PlusIcon className="size-4" />
        New shelf
      </button>
      {mark && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 rounded-full bg-foreground transition-[translate,width] duration-500 ease-spring"
          style={{ width: mark.width, translate: `${mark.left}px 0` }}
        />
      )}
      {creating && (
        <ShelfNameDialog
          open={creating}
          onOpenChange={setCreating}
          title="New shelf"
          submitLabel="Create"
          onSubmit={(name) => create.mutateAsync(name)}
        />
      )}
    </div>
  )
}
