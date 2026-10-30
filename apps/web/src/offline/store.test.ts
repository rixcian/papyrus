import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { fileCacheKey } from './caches'
import { type OfflineSource, OfflineStore } from './store'

function fakeCache() {
  const entries = new Map<string, Blob>()
  return {
    entries,
    open: async () => ({
      match: async (key: string) => (entries.has(key) ? new Response(entries.get(key)) : undefined),
      put: async (key: string, res: Response) => void entries.set(key, await res.blob()),
      delete: async (key: string) => entries.delete(key),
    }),
  }
}

const dune: OfflineSource = {
  id: 'book-1',
  title: 'Dune',
  authors: ['Frank Herbert'],
  coverUrl: '/api/books/book-1/cover?v=1',
  sharedBy: null,
  files: [{ id: 'file-1', format: 'epub', originalName: 'dune.epub', size: 5 }],
}

function setup(status = 200) {
  const cache = fakeCache()
  const fetched: string[] = []
  const persisted: number[] = []
  const store = new OfflineStore({
    factory: new IDBFactory(),
    cache: cache.open,
    fetch: async (input) => {
      fetched.push(String(input))
      return new Response('bytes', { status, headers: { 'content-length': '5' } })
    },
    storage: { persist: async () => persisted.push(1) > 0 } as unknown as StorageManager,
  })
  return { store, cache, fetched, persisted }
}

describe('OfflineStore', () => {
  it('stores Files and cover, records the Book, and asks for persistence once', async () => {
    const { store, cache, persisted } = setup()
    await store.save('alice', dune)
    await store.save('alice', { ...dune, id: 'book-2', coverUrl: null, files: [] })
    expect([...cache.entries.keys()].sort()).toEqual([dune.coverUrl, fileCacheKey('file-1')])
    expect(await store.get('alice', 'book-1')).toMatchObject({ title: 'Dune', bytes: 10 })
    expect((await store.findFile('alice', 'file-1'))?.bookId).toBe('book-1')
    expect(await (await store.fileBlob('file-1'))?.text()).toBe('bytes')
    expect(persisted).toHaveLength(1)
  })

  it('stores an Audio File as its Tracks, reporting progress, never as its zip', async () => {
    const { store, cache, fetched } = setup()
    const track = (n: number) => ({
      url: `/api/files/audio-1/tracks/${n}`,
      duration: 10,
      title: null,
      size: 5,
    })
    const progress: [number, number][] = []
    await store.save(
      'alice',
      {
        ...dune,
        coverUrl: null,
        files: [
          {
            id: 'audio-1',
            format: 'audio',
            originalName: 'Dune',
            size: 10,
            audio: { duration: 20, tracks: [track(0), track(1)], chapters: [] },
          },
        ],
      },
      (done, total) => progress.push([done, total]),
    )
    expect(fetched).toEqual(['/api/files/audio-1/tracks/0', '/api/files/audio-1/tracks/1'])
    expect([...cache.entries.keys()].sort()).toEqual(fetched)
    expect(progress.at(-1)).toEqual([10, 10])

    await store.remove('alice', ['book-1'])
    expect(cache.entries.size).toBe(0)
  })

  it('records nothing when a File fails to download', async () => {
    const { store } = setup(500)
    await expect(store.save('alice', { ...dune, coverUrl: null })).rejects.toThrow()
    expect(await store.list('alice')).toEqual([])
  })

  it('keeps shared bytes until the last Profile removes the Book', async () => {
    const { store, cache, fetched } = setup()
    await store.save('alice', dune)
    await store.save('bob', dune)
    expect(fetched).toHaveLength(2) // Bob reuses Alice's cached copy.
    await store.remove('alice', ['book-1'])
    expect(cache.entries.size).toBe(2)
    expect(await store.list('alice')).toEqual([])
    await store.removeAll('bob')
    expect(cache.entries.size).toBe(0)
  })
})
