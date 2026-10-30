import { compareCfi } from '@papyrus/shared'
import { useEffect, useState } from 'react'
import { syncEngine } from '@/sync'
import type { Bookmark, Highlight } from '@/sync/annotations'

export interface FileAnnotations {
  highlights: Highlight[]
  bookmarks: Bookmark[]
}

/** Live Highlights and Bookmarks for one File, in reading order; tombstones left out. */
export function useAnnotations(profileId: string, fileId: string): FileAnnotations {
  const [state, setState] = useState<FileAnnotations>({ highlights: [], bookmarks: [] })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const all = (await syncEngine.annotations.forFile(profileId, fileId)).filter(
        (a) => !a.deleted,
      )
      if (cancelled) return
      setState({
        highlights: all
          .filter((a): a is Highlight => a.kind === 'highlight')
          .sort((a, b) => compareCfi(a.cfiRange, b.cfiRange)),
        bookmarks: all
          .filter((a): a is Bookmark => a.kind === 'bookmark')
          .sort((a, b) => compareCfi(a.cfi, b.cfi)),
      })
    }
    void load()
    const unsubscribe = syncEngine.subscribe((p) => p === profileId && void load())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [profileId, fileId])

  return state
}

export const HIGHLIGHT_FILL: Record<Highlight['colour'], string> = {
  yellow: '#facc15',
  green: '#4ade80',
  blue: '#60a5fa',
  pink: '#f472b6',
}
