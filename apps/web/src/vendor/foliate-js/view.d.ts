// Papyrus: hand-written types for the parts of foliate-js's view.js the reader uses.

export interface TocItem {
  label: string
  href: string
  subitems?: TocItem[]
}

export interface RelocateDetail {
  cfi: string
  fraction: number
  tocItem?: TocItem
  location?: { current: number; next: number; total: number }
  range?: Range
}

export interface LoadDetail {
  doc: Document
  index: number
}

export interface FoliateRenderer extends HTMLElement {
  setStyles?(css: string): void
  next(distance?: number): Promise<void>
  prev(distance?: number): Promise<void>
}

export interface FoliateBook {
  toc?: TocItem[]
  dir?: string
  metadata?: { title?: string | Record<string, string> }
}

export interface Annotation {
  value: string
}

export interface DrawAnnotationDetail {
  draw: (fn: import('./overlayer.js').DrawFunction, options?: Record<string, unknown>) => void
  annotation: Annotation
  doc: Document
  range: Range
}

export interface ShowAnnotationDetail {
  value: string
  index: number
  range: Range
}

export interface SearchExcerpt {
  pre: string
  match: string
  post: string
}

export interface SearchMatch {
  cfi: string
  excerpt: SearchExcerpt
}

/** What `View.search` yields: progress through the sections, a section's matches, then 'done'. */
export type SearchEvent = { progress: number } | { label: string; subitems: SearchMatch[] } | 'done'

export interface SearchOptions {
  query: string
  /** Search one section only. */
  index?: number
  matchCase?: boolean
  matchDiacritics?: boolean
  matchWholeWords?: boolean
  draw?: import('./overlayer.js').DrawFunction
  drawOptions?: Record<string, unknown>
}

export declare class View extends HTMLElement {
  search(opts: SearchOptions): AsyncGenerator<SearchEvent>
  clearSearch(): void
  addAnnotation(annotation: Annotation, remove?: boolean): Promise<unknown>
  deleteAnnotation(annotation: Annotation): Promise<unknown>
  getCFI(index: number, range: Range): string
  book: FoliateBook
  renderer: FoliateRenderer
  open(book: Blob | File | string): Promise<void>
  init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
  goTo(target: string | number): Promise<unknown>
  goToFraction(fraction: number): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  goLeft(): Promise<void>
  goRight(): Promise<void>
  close(): void
}

export declare const makeBook: (file: Blob | File | string) => Promise<FoliateBook>
