/** The fixed palette a Profile's avatar colour is picked from. */
export const PROFILE_COLOURS = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'slate',
] as const

export type ProfileColour = (typeof PROFILE_COLOURS)[number]

export const PROFILE_NAME_MAX = 32

/** Trims and collapses whitespace; Profile names are compared case-insensitively. */
export function normaliseProfileName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function profileInitial(name: string): string {
  return [...normaliseProfileName(name)][0]?.toUpperCase() ?? '?'
}
