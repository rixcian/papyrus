import { compareCfi } from '@papyrus/shared'

export interface ExportHighlight {
  fileId: string
  format: string
  cfiRange: string
  text: string
  note: string | null
}

const quote = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n')

/**
 * One Markdown file per Book: its Highlights in reading order, each followed by its Note
 * as a blockquote. Files of one Book get a heading each when there are several (spec).
 */
export function highlightsMarkdown(
  title: string,
  authors: string[],
  highlights: ExportHighlight[],
): string {
  const lines = [`# ${title}`, '']
  if (authors.length) lines.push(`by ${authors.join(', ')}`, '')
  if (!highlights.length) return `${[...lines, '_No highlights yet._'].join('\n')}\n`

  const byFile = new Map<string, ExportHighlight[]>()
  for (const h of highlights) byFile.set(h.fileId, [...(byFile.get(h.fileId) ?? []), h])
  for (const group of byFile.values()) {
    if (byFile.size > 1) lines.push(`## ${group[0]?.format.toUpperCase()}`, '')
    for (const h of [...group].sort((a, b) => compareCfi(a.cfiRange, b.cfiRange))) {
      lines.push(h.text.trim().replace(/\s*\n\s*/g, ' '), '')
      if (h.note?.trim()) lines.push(quote(h.note), '')
      lines.push('---', '')
    }
  }
  while (lines.at(-1) === '' || lines.at(-1) === '---') lines.pop()
  return `${lines.join('\n')}\n`
}

/** A safe download name: "Dune - highlights.md". */
export function exportFilename(title: string): string {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Book'
  return `${base} - highlights.md`
}
