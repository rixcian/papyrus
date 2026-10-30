/**
 * Just enough EPUB CFI to put locations in reading order, on the server as well as in the
 * browser (Markdown export, annotation lists). Not a full parser: assertions in brackets,
 * temporal and spatial offsets are ignored.
 */

/** The numeric steps of a CFI's start position: `/6/4!/4/2/1:10` → [6, 4, 4, 2, 1, 10]. */
export function cfiSortKey(cfi: string): number[] {
  const inner = /^epubcfi\((.*)\)$/s.exec(cfi.trim())?.[1] ?? cfi
  const parts = splitTopLevel(inner)
  const start = parts.length === 3 ? `${parts[0]}${parts[1]}` : (parts[0] ?? '')
  const withoutAssertions = start.replace(/\[(?:\^.|[^\]])*\]/g, '').replace(/[~@][^/!,:]*/g, '')
  const key: number[] = []
  for (const step of withoutAssertions.split(/[/!]/)) {
    if (!step) continue
    const [index, offset] = step.split(':')
    if (index) key.push(Number.parseInt(index, 10) || 0)
    if (offset !== undefined) key.push(Number.parseInt(offset, 10) || 0)
  }
  return key
}

export function compareCfi(a: string, b: string): number {
  const ka = cfiSortKey(a)
  const kb = cfiSortKey(b)
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
    const d = (ka[i] as number) - (kb[i] as number)
    if (d !== 0) return Math.sign(d)
  }
  return Math.sign(ka.length - kb.length)
}

/** Splits on commas outside `[...]` assertions (range CFIs are `parent,start,end`). */
function splitTopLevel(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < value.length; i++) {
    const c = value[i] as string
    if (c === '^') {
      current += c + (value[++i] ?? '')
      continue
    }
    if (c === '[') depth++
    if (c === ']') depth--
    if (c === ',' && depth === 0) {
      out.push(current)
      current = ''
    } else current += c
  }
  out.push(current)
  return out
}
