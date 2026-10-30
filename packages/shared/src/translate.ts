/** Languages DeepL translates into, as its `target_lang` codes, with names for the picker. */
export const TRANSLATE_TARGETS = [
  { code: 'CS', label: 'Czech' },
  { code: 'EN-GB', label: 'English (UK)' },
  { code: 'EN-US', label: 'English (US)' },
  { code: 'DE', label: 'German' },
  { code: 'FR', label: 'French' },
  { code: 'ES', label: 'Spanish' },
  { code: 'IT', label: 'Italian' },
  { code: 'PL', label: 'Polish' },
  { code: 'SK', label: 'Slovak' },
  { code: 'UK', label: 'Ukrainian' },
  { code: 'RU', label: 'Russian' },
  { code: 'NL', label: 'Dutch' },
  { code: 'PT-PT', label: 'Portuguese' },
  { code: 'PT-BR', label: 'Portuguese (Brazil)' },
  { code: 'SV', label: 'Swedish' },
  { code: 'DA', label: 'Danish' },
  { code: 'NB', label: 'Norwegian' },
  { code: 'FI', label: 'Finnish' },
  { code: 'HU', label: 'Hungarian' },
  { code: 'RO', label: 'Romanian' },
  { code: 'BG', label: 'Bulgarian' },
  { code: 'EL', label: 'Greek' },
  { code: 'TR', label: 'Turkish' },
  { code: 'JA', label: 'Japanese' },
  { code: 'KO', label: 'Korean' },
  { code: 'ZH-HANS', label: 'Chinese (simplified)' },
] as const

export type TranslateTarget = (typeof TRANSLATE_TARGETS)[number]['code']
export const TRANSLATE_TARGET_CODES = TRANSLATE_TARGETS.map((t) => t.code) as [
  TranslateTarget,
  ...TranslateTarget[],
]
export const DEFAULT_TRANSLATE_TARGET: TranslateTarget = 'CS'
/** Longest selection sent for translation, in characters. */
export const TRANSLATE_TEXT_MAX = 5000
