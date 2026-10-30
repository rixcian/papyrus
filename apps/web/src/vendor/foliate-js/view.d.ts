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

export declare class View extends HTMLElement {
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
