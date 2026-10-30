import { type FormEvent, useState } from 'react'
import { ApiError } from '@/api/client'
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
import { type BookDetail, useUpdateBook } from '@/lib/books'

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

/** Owner-only metadata editing (ticket 09); "Find online" arrives with slice 16. */
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
            <DialogTitle>Edit metadata</DialogTitle>
          </DialogHeader>
          <DialogPanel className="grid gap-4 sm:grid-cols-2">
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
            {error && <p className="text-destructive-foreground text-sm sm:col-span-2">{error}</p>}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending || !title.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
