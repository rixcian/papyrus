import { GlobeIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { ApiError } from '@/api/client'
import {
  coverPreview,
  FindOnline,
  type FoundMetadata,
  type MetadataForm,
} from '@/components/find-online'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type BookDetail, useSetCover, useUpdateBook } from '@/lib/books'

const lines = (value: string) =>
  value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

const commaList = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function TextField({
  label,
  value,
  onChange,
  ...props
}: { label: string; value: string; onChange: (v: string) => void } & Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange'
>) {
  return (
    <Label className="flex flex-col items-stretch gap-1.5">
      <span>{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} {...props} />
    </Label>
  )
}

/** Owner-only metadata editing, with "Find online" on Open Library (ticket 09). */
export function EditBookDialog({
  book,
  open,
  onOpenChange,
}: {
  book: BookDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateBook(book.id)
  const [title, setTitle] = useState(book.title)
  const [authors, setAuthors] = useState(book.authors.join('\n'))
  const [seriesName, setSeriesName] = useState(book.seriesName ?? '')
  const [seriesIndex, setSeriesIndex] = useState(book.seriesIndex?.toString() ?? '')
  const [tags, setTags] = useState(book.tags.join(', '))
  const [description, setDescription] = useState(book.description ?? '')
  const [publisher, setPublisher] = useState(book.publisher ?? '')
  const [publishedDate, setPublishedDate] = useState(book.publishedDate ?? '')
  const [language, setLanguage] = useState(book.language ?? '')
  const [isbn, setIsbn] = useState(book.isbn ?? '')
  const [error, setError] = useState<string | null>(null)
  const [findingOnline, setFindingOnline] = useState(false)
  const [coverId, setCoverId] = useState<number | null>(null)
  const setCover = useSetCover(book.id)

  const form: MetadataForm = {
    title,
    authors,
    tags,
    description,
    publisher,
    publishedDate,
    language,
    isbn,
  }
  const setters: Record<keyof MetadataForm, (v: string) => void> = {
    title: setTitle,
    authors: setAuthors,
    tags: setTags,
    description: setDescription,
    publisher: setPublisher,
    publishedDate: setPublishedDate,
    language: setLanguage,
    isbn: setIsbn,
  }
  const applyFound = ({ coverId: found, ...fields }: FoundMetadata) => {
    for (const [key, value] of Object.entries(fields))
      if (value !== undefined) setters[key as keyof MetadataForm](value)
    if (found) setCoverId(found)
    setFindingOnline(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const index = seriesIndex.trim() === '' ? null : Number(seriesIndex)
    if (index !== null && !Number.isFinite(index)) return setError('Series number must be a number')
    try {
      await update.mutateAsync({
        title,
        authors: lines(authors),
        seriesName,
        seriesIndex: index,
        tags: commaList(tags),
        description,
        publisher,
        publishedDate,
        language,
        isbn,
      })
      if (coverId) await setCover.mutateAsync(coverId)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pe-8">
              <DialogTitle>{findingOnline ? 'Find online' : 'Edit metadata'}</DialogTitle>
              {!findingOnline && (
                <Button size="sm" variant="outline" onClick={() => setFindingOnline(true)}>
                  <GlobeIcon />
                  Find online
                </Button>
              )}
            </div>
          </DialogHeader>
          {findingOnline ? (
            <DialogPanel>
              <FindOnline
                current={form}
                hasCover={Boolean(book.coverUrl) || coverId !== null}
                onApply={applyFound}
                onCancel={() => setFindingOnline(false)}
              />
            </DialogPanel>
          ) : (
            <DialogPanel className="grid gap-4 sm:grid-cols-2">
              {coverId && (
                <div className="flex items-center gap-3 rounded-xl border p-3 text-sm sm:col-span-2">
                  <img src={coverPreview(coverId, 'S')} alt="" className="w-10 rounded-sm" />
                  <span className="flex-1">
                    The cover from Open Library is saved with the rest.
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setCoverId(null)}>
                    Keep current cover
                  </Button>
                </div>
              )}
              <div className="sm:col-span-2">
                <TextField label="Title" value={title} onChange={setTitle} required />
              </div>
              <Label className="flex flex-col items-stretch gap-1.5 sm:col-span-2">
                <span>Authors, one per line</span>
                <Textarea value={authors} onChange={(e) => setAuthors(e.target.value)} rows={2} />
              </Label>
              <TextField label="Series" value={seriesName} onChange={setSeriesName} />
              <TextField
                label="Number in series"
                value={seriesIndex}
                onChange={setSeriesIndex}
                inputMode="decimal"
              />
              <div className="sm:col-span-2">
                <TextField label="Tags, comma-separated" value={tags} onChange={setTags} />
              </div>
              <Label className="flex flex-col items-stretch gap-1.5 sm:col-span-2">
                <span>Description</span>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                />
              </Label>
              <TextField label="Publisher" value={publisher} onChange={setPublisher} />
              <TextField label="Published" value={publishedDate} onChange={setPublishedDate} />
              <TextField label="Language" value={language} onChange={setLanguage} />
              <TextField label="ISBN" value={isbn} onChange={setIsbn} />
              {error && (
                <p className="text-destructive-foreground text-sm sm:col-span-2">{error}</p>
              )}
            </DialogPanel>
          )}
          {!findingOnline && (
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={update.isPending || setCover.isPending || !title.trim()}
              >
                Save
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogPopup>
    </Dialog>
  )
}
