import { useQuery } from '@tanstack/react-query'
import { type KeyboardEvent, useState } from 'react'
import { api, unwrap } from '@/api/client'
import type { operations } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Candidate = Awaited<ReturnType<typeof lookup>>['candidates'][number]

/** The Edit metadata form's fields, as the form holds them. */
export interface MetadataForm {
  title: string
  /** One per line. */
  authors: string
  /** Comma-separated. */
  tags: string
  description: string
  publisher: string
  publishedDate: string
  language: string
  isbn: string
}

export type FoundMetadata = Partial<MetadataForm> & { coverId?: number }

type LookupQuery = NonNullable<operations['lookupMetadata']['parameters']['query']>

function lookup(query: LookupQuery) {
  return unwrap(api.GET('/api/metadata/lookup', { params: { query } }))
}

export const coverPreview = (coverId: number, size: 'S' | 'M' = 'M') =>
  `/api/metadata/cover/${coverId}?size=${size}`

const FIELDS: { key: keyof MetadataForm; label: string; from: (c: Candidate) => string }[] = [
  { key: 'title', label: 'Title', from: (c) => c.title },
  { key: 'authors', label: 'Authors', from: (c) => c.authors.join('\n') },
  { key: 'description', label: 'Description', from: (c) => c.description ?? '' },
  { key: 'publisher', label: 'Publisher', from: (c) => c.publisher ?? '' },
  { key: 'publishedDate', label: 'Published', from: (c) => c.publishedDate ?? '' },
  { key: 'language', label: 'Language', from: (c) => c.language ?? '' },
  { key: 'isbn', label: 'ISBN', from: (c) => c.isbn ?? '' },
  { key: 'tags', label: 'Tags', from: (c) => c.tags.join(', ') },
]

/**
 * "Find online" (ticket 09): look the Book up on Open Library, pick a match, and tick which
 * fields to copy into the form. Nothing is saved until the form is.
 */
export function FindOnline({
  current,
  hasCover,
  onApply,
  onCancel,
}: {
  current: MetadataForm
  hasCover: boolean
  onApply: (found: FoundMetadata) => void
  onCancel: () => void
}) {
  const [isbn, setIsbn] = useState(current.isbn)
  const [title, setTitle] = useState(current.title)
  const [author, setAuthor] = useState(current.authors.split('\n')[0] ?? '')
  const [query, setQuery] = useState<LookupQuery | null>(() =>
    current.isbn || current.title ? params(current.isbn, current.title, author) : null,
  )
  const [picked, setPicked] = useState<Candidate | null>(null)
  const results = useQuery({
    queryKey: ['metadata-lookup', query],
    enabled: Boolean(query),
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () => lookup(query ?? {}),
  })

  function params(i: string, t: string, a: string): LookupQuery {
    return Object.fromEntries(
      Object.entries({ isbn: i.trim(), title: t.trim(), author: a.trim() }).filter(([, v]) => v),
    )
  }

  const search = () => {
    if (!isbn.trim() && !title.trim()) return
    setPicked(null)
    setQuery(params(isbn, title, author))
  }
  // This sits inside the Edit metadata form, so Enter searches instead of saving the Book.
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    search()
  }

  if (picked)
    return (
      <PickFields
        candidate={picked}
        current={current}
        hasCover={hasCover}
        onBack={() => setPicked(null)}
        onApply={onApply}
      />
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto]">
        <Input
          aria-label="ISBN"
          placeholder="ISBN"
          value={isbn}
          onKeyDown={onEnter}
          onChange={(e) => setIsbn(e.target.value)}
        />
        <Input
          aria-label="Title"
          placeholder="Title"
          value={title}
          onKeyDown={onEnter}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          aria-label="Author"
          placeholder="Author"
          value={author}
          onKeyDown={onEnter}
          onChange={(e) => setAuthor(e.target.value)}
        />
        <Button onClick={search} disabled={!isbn.trim() && !title.trim()}>
          Search
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Searches Open Library through your Papyrus server. An ISBN finds the exact edition.
      </p>

      {results.isFetching && (
        <p className="text-muted-foreground text-sm">Searching Open Library…</p>
      )}
      {results.isError && (
        <p className="text-destructive-foreground text-sm">{results.error.message}</p>
      )}
      {results.data && !results.isFetching && results.data.candidates.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing found. Try fewer words, or the ISBN.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {results.data?.candidates.map((c) => (
          <li key={`${c.key}-${c.isbn}`}>
            <button
              type="button"
              onClick={() => setPicked(c)}
              className="flex w-full items-center gap-3 rounded-md p-2 text-start hover:bg-accent"
            >
              <div className="aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-sm bg-muted">
                {c.coverId && (
                  <img
                    src={coverPreview(c.coverId, 'S')}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{c.title}</div>
                <div className="truncate text-muted-foreground text-xs">
                  {[c.authors.join(', '), c.publishedDate, c.publisher].filter(Boolean).join(' · ')}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onCancel}>
          Back to the form
        </Button>
      </div>
    </div>
  )
}

function PickFields({
  candidate,
  current,
  hasCover,
  onBack,
  onApply,
}: {
  candidate: Candidate
  current: MetadataForm
  hasCover: boolean
  onBack: () => void
  onApply: (found: FoundMetadata) => void
}) {
  const offered = FIELDS.map((f) => ({ ...f, value: f.from(candidate) })).filter(
    (f) => f.value && f.value !== current[f.key],
  )
  // Pre-ticked only where the form is empty; replacing what's there is the user's call.
  const [ticked, setTicked] = useState(
    () =>
      new Set<string>([
        ...offered.filter((f) => !current[f.key].trim()).map((f) => f.key),
        ...(candidate.coverId && !hasCover ? ['cover'] : []),
      ]),
  )
  const toggle = (key: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const apply = () => {
    const found: FoundMetadata = {}
    for (const f of offered) if (ticked.has(f.key)) found[f.key] = f.value
    if (ticked.has('cover') && candidate.coverId) found.coverId = candidate.coverId
    onApply(found)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Choose what to copy from <span className="font-medium">{candidate.title}</span>. You can
        still edit everything before saving.
      </p>
      <ul className="flex flex-col divide-y rounded-xl border">
        {candidate.coverId && (
          <li>
            <Label className="flex items-start gap-3 p-3">
              <Checkbox
                checked={ticked.has('cover')}
                onCheckedChange={(on) => toggle('cover', on)}
              />
              <span className="flex-1 font-medium text-sm">Cover</span>
              <img
                src={coverPreview(candidate.coverId)}
                alt="Cover from Open Library"
                className="w-16 rounded-sm"
              />
            </Label>
          </li>
        )}
        {offered.map((f) => (
          <li key={f.key}>
            <Label className="flex items-start gap-3 p-3">
              <Checkbox checked={ticked.has(f.key)} onCheckedChange={(on) => toggle(f.key, on)} />
              <span className="w-24 shrink-0 font-medium text-sm">{f.label}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span
                  className={cn(
                    'block whitespace-pre-line',
                    f.key === 'description' && 'line-clamp-4',
                  )}
                >
                  {f.value}
                </span>
                <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                  {current[f.key].trim()
                    ? `Now: ${current[f.key].replace(/\n/g, ', ')}`
                    : 'Now empty'}
                </span>
              </span>
            </Label>
          </li>
        ))}
        {offered.length === 0 && !candidate.coverId && (
          <li className="p-3 text-muted-foreground text-sm">Nothing here differs from the form.</li>
        )}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Back to results
        </Button>
        <Button disabled={ticked.size === 0} onClick={apply}>
          Copy {ticked.size || ''} into the form
        </Button>
      </div>
    </div>
  )
}
