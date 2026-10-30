import { extractEpub } from './epub.ts'
import type { FileFormat } from './formats.ts'
import { type Extracted, titleFromFilename } from './metadata.ts'
import { extractMobi } from './mobi.ts'

/** Metadata for any File; formats without an extractor get a title from the filename. */
export async function extract(
  format: FileFormat,
  file: string,
  originalName: string,
): Promise<Extracted> {
  const extracted: Extracted =
    format === 'epub'
      ? await extractEpub(file)
      : format === 'mobi' || format === 'azw3'
        ? await extractMobi(file)
        : { metadata: { authors: [], tags: [] } }
  if (!extracted.metadata.title) extracted.metadata.title = titleFromFilename(originalName)
  return extracted
}
