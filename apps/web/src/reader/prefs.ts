import { useCallback, useState } from 'react'

/**
 * Reader preferences are per device and per Profile, kept in localStorage and never synced
 * (ticket 08).
 */
export interface ReaderPrefs {
  font: 'publisher' | 'serif' | 'sans'
  fontSize: number
  lineHeight: number
  margin: 'narrow' | 'normal' | 'wide'
  theme: ReaderThemeName
  flow: 'paginated' | 'scrolled'
}

export type ReaderThemeName = 'light' | 'sepia' | 'dark'

export const READER_THEMES: Record<
  ReaderThemeName,
  { label: string; bg: string; fg: string; link: string; dark: boolean }
> = {
  light: { label: 'Light', bg: '#ffffff', fg: '#1f1f1f', link: '#1d4ed8', dark: false },
  sepia: { label: 'Sepia', bg: '#f4ecd8', fg: '#5b4636', link: '#8a4b14', dark: false },
  // Night's own ground (--background in index.css) with soft zinc text, so the reader sits in
  // the same dark as the rest of the app.
  dark: { label: 'Dark', bg: '#101012', fg: '#d4d4d8', link: '#93c5fd', dark: true },
}

export const DEFAULT_PREFS: ReaderPrefs = {
  font: 'publisher',
  fontSize: 100,
  lineHeight: 1.5,
  margin: 'normal',
  // Night: a new reader opens dark like the rest of the app.
  theme: 'dark',
  flow: 'paginated',
}

export const FONT_SIZES = [80, 90, 100, 110, 120, 135, 150, 175, 200]
export const LINE_HEIGHTS = [1.2, 1.4, 1.5, 1.7, 2]

export const MARGINS: Record<ReaderPrefs['margin'], { gap: string; maxInlineSize: string }> = {
  narrow: { gap: '4%', maxInlineSize: '1000px' },
  normal: { gap: '7%', maxInlineSize: '720px' },
  wide: { gap: '12%', maxInlineSize: '600px' },
}

const FONT_STACKS: Record<Exclude<ReaderPrefs['font'], 'publisher'>, string> = {
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  sans: '"Inter Variable", system-ui, sans-serif',
}

const key = (profileId: string) => `papyrus:reader-prefs:${profileId}`

export function loadPrefs(profileId: string): ReaderPrefs {
  try {
    const stored = JSON.parse(
      localStorage.getItem(key(profileId)) ?? 'null',
    ) as Partial<ReaderPrefs> | null
    return { ...DEFAULT_PREFS, ...stored }
  } catch {
    return DEFAULT_PREFS
  }
}

export function useReaderPrefs(profileId: string) {
  const [prefs, setPrefs] = useState(() => loadPrefs(profileId))
  const update = useCallback(
    (change: Partial<ReaderPrefs>) => {
      setPrefs((current) => {
        const next = { ...current, ...change }
        localStorage.setItem(key(profileId), JSON.stringify(next))
        return next
      })
    },
    [profileId],
  )
  return [prefs, update] as const
}

/** CSS injected into every section document through the renderer's `setStyles`. */
export function bookCss(prefs: ReaderPrefs): string {
  const theme = READER_THEMES[prefs.theme]
  const font =
    prefs.font === 'publisher' ? '' : `font-family: ${FONT_STACKS[prefs.font]} !important;`
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
      color-scheme: ${theme.dark ? 'dark' : 'light'};
      background: ${theme.bg} !important;
      color: ${theme.fg} !important;
      font-size: ${prefs.fontSize}% !important;
    }
    body { background: transparent !important; color: inherit !important; }
    a:link, a:visited { color: ${theme.link} !important; }
    ${font ? `body, p, li, blockquote, dd, div, span, h1, h2, h3, h4, h5, h6 { ${font} }` : ''}
    p, li, blockquote, dd {
      line-height: ${prefs.lineHeight} !important;
      hanging-punctuation: allow-end last;
      widows: 2;
    }
    pre { white-space: pre-wrap !important; }
    img, svg { max-width: 100%; height: auto; }
    ${theme.dark ? 'img { filter: brightness(0.9); }' : ''}
    aside[epub|type~="footnote"], aside[epub|type~="endnote"], aside[epub|type~="note"], aside[epub|type~="rearnote"] {
      display: none;
    }
  `
}
