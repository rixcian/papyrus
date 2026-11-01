import type { BookDetail, BookFile, BookSummary } from '@/lib/books'
import type { Profile } from '@/lib/session'
import type { Highlight } from '@/sync/annotations'

export const ada: Profile = { id: 'p-ada', name: 'Ada', colour: 'blue' }
export const bob: Profile = { id: 'p-bob', name: 'Bob', colour: 'green' }

export function bookSummary(overrides: Partial<BookSummary> = {}): BookSummary {
  return {
    id: 'b1',
    title: 'Dune',
    authors: ['Frank Herbert'],
    seriesName: null,
    seriesIndex: null,
    coverUrl: null,
    formats: ['epub'],
    owned: true,
    sharedBy: null,
    addedAt: 1_700_000_000_000,
    readStatus: 'unread',
    lastRead: null,
    ...overrides,
  }
}

export function bookFile(overrides: Partial<BookFile> = {}): BookFile {
  return {
    id: 'f1',
    format: 'epub',
    originalName: 'dune.epub',
    size: 2048,
    readable: true,
    kind: 'text',
    duration: null,
    trackCount: 0,
    url: '/api/files/f1',
    addedAt: 1_700_000_000_000,
    ...overrides,
  }
}

export function audioFile(overrides: Partial<BookFile> = {}): BookFile {
  return bookFile({
    id: 'a1',
    format: 'audio',
    originalName: 'Dune (audiobook)',
    size: 50_000_000,
    readable: false,
    kind: 'audio',
    duration: 3600,
    trackCount: 2,
    url: '/api/files/a1',
    ...overrides,
  })
}

export function bookDetail(overrides: Partial<BookDetail> = {}): BookDetail {
  return {
    ...bookSummary(),
    description: null,
    language: null,
    publisher: null,
    publishedDate: null,
    isbn: null,
    tags: [],
    ownerName: 'Ada',
    hidden: false,
    share: { mode: 'none', profiles: [] },
    shelves: [],
    files: [bookFile()],
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

export function highlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    kind: 'highlight',
    profileId: 'p',
    hlc: '',
    id: 'h1',
    fileId: 'f1',
    cfiRange: 'epubcfi(/6/4!/4/2,/1:0,/1:10)',
    colour: 'yellow',
    text: 'The spice must flow',
    note: null,
    deleted: false,
    ...overrides,
  }
}
