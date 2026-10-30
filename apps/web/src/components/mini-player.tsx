import { PauseIcon, PlayIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { SKIP_BACK } from '@/player/player'
import { usePlayer, usePlayerState } from '@/player/provider'
import { chapterAt } from '@/player/timeline'
import { BookCover } from './book-cover'
import { Button } from './ui/button'

/**
 * Keeps the Audio File in reach while browsing (spec: Mini-player). Pages outside the app
 * shell, the full player and the ebook reader, don't show it; playback goes on regardless.
 */
export function MiniPlayer() {
  const player = usePlayer()
  const { item, playing, time, error } = usePlayerState()

  // Bars fixed to the bottom (selection, uploads) sit above it.
  useEffect(() => {
    if (!item) return
    const root = document.documentElement
    root.style.setProperty('--player-offset', 'calc(4.25rem + env(safe-area-inset-bottom))')
    return () => {
      root.style.removeProperty('--player-offset')
    }
  }, [item])

  if (!item) return null
  const chapter = item.chapters[chapterAt(item.chapters, time)]
  return (
    <section
      aria-label="Now playing"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-popover/95 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-muted">
        <div
          className="h-full bg-primary"
          style={{ width: `${item.duration ? (time / item.duration) * 100 : 0}%` }}
        />
      </div>
      <div className="mx-auto flex h-17 max-w-6xl items-center gap-3 px-3 sm:px-6">
        <Link to={`/listen/${item.fileId}`} className="flex min-w-0 flex-1 items-center gap-3">
          <BookCover
            title={item.title}
            coverUrl={item.coverUrl}
            className="aspect-square w-11 shrink-0 rounded-md text-[0px]"
          />
          <span className="min-w-0">
            <span className="block truncate font-medium text-sm">{item.title}</span>
            <span
              className={`block truncate text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {error ?? chapter?.title ?? item.authors.join(', ')}
            </span>
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Back ${SKIP_BACK} seconds`}
          onClick={() => player.skip(-SKIP_BACK)}
        >
          <RotateCcwIcon />
        </Button>
        <Button
          size="icon"
          className="rounded-full"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => player.toggle()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close player"
          onClick={() => player.close()}
        >
          <XIcon />
        </Button>
      </div>
    </section>
  )
}
