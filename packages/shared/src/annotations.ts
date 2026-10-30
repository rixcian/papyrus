/** The fixed set of Highlight colours (GLOSSARY: Highlight). */
export const HIGHLIGHT_COLOURS = ['yellow', 'green', 'blue', 'pink'] as const
export type HighlightColour = (typeof HIGHLIGHT_COLOURS)[number]

export const NOTE_MAX = 10_000
export const HIGHLIGHT_TEXT_MAX = 10_000
