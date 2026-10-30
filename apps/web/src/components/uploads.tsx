import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router'
import { bookKeys, type IngestResult, uploadFile } from '@/lib/books'
import { cn } from '@/lib/utils'

const CONCURRENCY = 3

interface UploadItem {
  id: number
  file: File
  progress: number
  state: 'queued' | 'uploading' | 'done'
  result?: IngestResult
}

const UploadContext = createContext<{ addFiles: (files: Iterable<File>) => void } | null>(null)

export function useUploads() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUploads outside UploadProvider')
  return ctx
}

/** Queues uploads, runs three at a time, and accepts files dropped anywhere. */
export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const nextId = useRef(1)
  const queryClient = useQueryClient()

  const patch = useCallback((id: number, change: Partial<UploadItem>) => {
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...change } : i)))
  }, [])

  const addFiles = useCallback((files: Iterable<File>) => {
    const added = [...files].map((file) => ({
      id: nextId.current++,
      file,
      progress: 0,
      state: 'queued' as const,
    }))
    if (added.length) setItems((all) => [...all, ...added])
  }, [])

  // Start queued uploads whenever a slot is free.
  useEffect(() => {
    const running = items.filter((i) => i.state === 'uploading').length
    const next = items.filter((i) => i.state === 'queued').slice(0, CONCURRENCY - running)
    for (const item of next) {
      patch(item.id, { state: 'uploading' })
      uploadFile(item.file, (progress) => patch(item.id, { progress }))
        .catch((e: Error): IngestResult => ({ status: 'failed', message: e.message }))
        .then((result) => {
          patch(item.id, { state: 'done', progress: 1, result })
          if (result.status !== 'failed')
            void queryClient.invalidateQueries({ queryKey: bookKeys.all })
        })
    }
  }, [items, patch, queryClient])

  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (e.dataTransfer) addFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [addFiles])

  return (
    <UploadContext.Provider value={{ addFiles }}>
      {children}
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-3xl border-2 border-primary border-dashed bg-background/80 font-medium text-lg">
          Drop to add to your library
        </div>
      )}
      {items.length > 0 && (
        <UploadTray
          items={items}
          onClear={() => setItems((all) => all.filter((i) => i.state !== 'done'))}
        />
      )}
    </UploadContext.Provider>
  )
}

const resultText: Record<IngestResult['status'], string> = {
  created: 'New Book',
  attached: 'Added to',
  duplicate: 'Already in your library',
  failed: 'Failed',
}

function UploadTray({ items, onClear }: { items: UploadItem[]; onClear: () => void }) {
  const done = items.filter((i) => i.state === 'done').length
  return (
    <aside className="fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover shadow-lg">
      <header className="flex items-center justify-between border-border border-b px-4 py-2.5 text-sm">
        <span className="font-medium">
          Uploads {done}/{items.length}
        </span>
        {done > 0 && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={onClear}
          >
            Clear finished
          </button>
        )}
      </header>
      <ul className="max-h-72 overflow-y-auto p-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg px-2 py-1.5 text-sm">
            <div className="truncate">{item.file.name}</div>
            {item.state !== 'done' ? (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${item.progress * 100}%` }}
                />
              </div>
            ) : (
              item.result && (
                <div
                  className={cn(
                    'text-xs',
                    item.result.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {resultText[item.result.status]}
                  {item.result.status === 'attached' &&
                    item.result.title &&
                    ` ${item.result.title}`}
                  {item.result.status === 'failed' &&
                    item.result.message &&
                    `: ${item.result.message}`}
                  {item.result.bookId &&
                    item.result.status === 'duplicate' &&
                    item.result.title && (
                      <>
                        :{' '}
                        <Link to="/" className="underline">
                          {item.result.title}
                        </Link>
                      </>
                    )}
                </div>
              )
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
