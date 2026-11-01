import { PauseIcon, PlayIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { Link } from 'react-router'
import { SKIP_BACK } from '@/player/player'
import { usePlayer, usePlayerState } from '@/player/provider'
import { chapterAt } from '@/player/timeline'
import { BookCover } from './book-cover'
import { Button } from './ui/button'

/**
 * Keeps the Audio File in reach while browsing (spec: Mini-player). Pages outside the app
 * shell, the full player and the ebook reader, don't show it; playback goes on regardless.
 * On phones it floats above the bottom nav; on wider screens, in the bottom corner.
 */
export function MiniPlayer() {
  const player = usePlayer()
  const { item, playing, time, error } = usePlayerState()

  if (!item) return null
  const chapter = item.chapters[chapterAt(item.chapters, time)]
  return (
    <section
      aria-label="Now playing"
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 animate-rise overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/80 shadow-black/50 shadow-xl backdrop-blur-xl backdrop-saturate-150 sm:start-auto sm:end-6 sm:bottom-6 sm:w-96"
    >
      <div className="flex h-16 items-center gap-2 ps-2 pe-1.5">
        <Link
          to={`/listen/${item.fileId}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition-colors hover:bg-white/5"
        >
          <BookCover
            title={item.title}
            coverUrl={item.coverUrl}
            className="aspect-square w-11 shrink-0 rounded-lg text-[0px]"
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
          className="rounded-full"
          aria-label={`Back ${SKIP_BACK} seconds`}
          onClick={() => player.skip(-SKIP_BACK)}
        >
          <RotateCcwIcon />
        </Button>
        <Button
          size="icon"
          className="rounded-full transition-transform active:scale-90"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => player.toggle()}
        >
          {playing ? (
            <PauseIcon key="pause" className="animate-pop fill-current" />
          ) : (
            <PlayIcon key="play" className="animate-pop fill-current" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Close player"
          onClick={() => player.close()}
        >
          <XIcon />
        </Button>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
        <div
          className="h-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${item.duration ? (time / item.duration) * 100 : 0}%` }}
        />
      </div>
    </section>
  )
}
