export const FILE_FORMATS = ['epub', 'mobi', 'azw3', 'pdf', 'cbz', 'other'] as const
export type FileFormat = (typeof FILE_FORMATS)[number]

/** Only these open in the browser reader; anything else is stored for download (ticket 01). */
export const READABLE_FORMATS: ReadonlySet<FileFormat> = new Set(['epub', 'mobi', 'azw3'])

const BY_EXTENSION: Record<string, FileFormat> = {
  epub: 'epub',
  mobi: 'mobi',
  prc: 'mobi',
  azw: 'azw3',
  azw3: 'azw3',
  kf8: 'azw3',
  pdf: 'pdf',
  cbz: 'cbz',
}

export function formatFromFilename(name: string): FileFormat {
  const ext = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase()
  return (ext && BY_EXTENSION[ext]) || 'other'
}
