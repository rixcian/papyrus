import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api, unwrap } from '@/api/client'
import { Badge } from './ui/badge'

type Variant = 'success' | 'info' | 'outline' | 'error'
const STATUS: Record<string, { label: string; variant: Variant }> = {
  created: { label: 'New Book', variant: 'success' },
  attached: { label: 'Added to Book', variant: 'info' },
  duplicate: { label: 'Already in library', variant: 'outline' },
  failed: { label: 'Failed', variant: 'error' },
}

const when = (at: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at)

/** Settings → Imports: this Profile's import folder and what happened to its files (ticket 09). */
export function ImportsSection() {
  const imports = useQuery({
    queryKey: ['imports'],
    queryFn: () => unwrap(api.GET('/api/imports')),
    refetchInterval: 5_000,
  })
  if (!imports.data) return null
  const { enabled, folder, pollSeconds, records } = imports.data

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-xl">Imports</h2>
      {!enabled ? (
        <p className="text-muted-foreground text-sm">
          The import folder is off. Whoever runs this server can turn it on by setting{' '}
          <code className="rounded bg-muted px-1">PAPYRUS_IMPORT_DIR</code>.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Put epub, mobi or azw3 files (or a Calibre library) in{' '}
            <code className="rounded bg-muted px-1">import/{folder}/</code> on the server. It is
            checked every {pollSeconds === 1 ? 'second' : `${pollSeconds} seconds`}, and a file is
            imported once it has stopped changing.
          </p>
          {records.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing imported yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {records.map((r) => (
                <li key={r.path} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.path}</span>
                    <Badge variant={STATUS[r.status]?.variant ?? 'outline'}>
                      {STATUS[r.status]?.label ?? r.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2 text-muted-foreground text-xs">
                    <span>{when(r.at)}</span>
                    {r.bookId && r.title && r.status !== 'failed' && (
                      <Link to={`/books/${r.bookId}`} className="truncate underline">
                        {r.title}
                      </Link>
                    )}
                  </div>
                  {r.status === 'failed' && r.message && (
                    <p className="text-destructive-foreground text-xs">{r.message}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
