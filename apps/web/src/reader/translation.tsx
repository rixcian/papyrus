import {
  DEFAULT_TRANSLATE_TARGET,
  TRANSLATE_TARGETS,
  TRANSLATE_TEXT_MAX,
  type TranslateTarget,
} from '@papyrus/shared'
import { useQuery } from '@tanstack/react-query'
import { CopyIcon, XIcon } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { Button } from '@/components/ui/button'

const targetKey = (profileId: string) => `papyrus:translate-to:${profileId}`
const isTarget = (v: string | null): v is TranslateTarget =>
  TRANSLATE_TARGETS.some((t) => t.code === v)

/**
 * The language selections are translated into, per Profile and device. Kept apart from the
 * reader preferences, which restyle the book whenever they change.
 */
export function useTranslateTarget(profileId: string) {
  const [target, setTarget] = useState<TranslateTarget>(() => {
    const stored = localStorage.getItem(targetKey(profileId))
    return isTarget(stored) ? stored : DEFAULT_TRANSLATE_TARGET
  })
  const update = useCallback(
    (next: TranslateTarget) => {
      localStorage.setItem(targetKey(profileId), next)
      setTarget(next)
    },
    [profileId],
  )
  return [target, update] as const
}

/** Whether this server has translation set up; checked once per session. */
export function useTranslationEnabled(): boolean {
  const status = useQuery({
    queryKey: ['translate', 'status'],
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: () => unwrap(api.GET('/api/translate/status')),
  })
  return status.data?.enabled ?? false
}

const languageNames =
  typeof Intl.DisplayNames === 'undefined'
    ? null
    : new Intl.DisplayNames(['en'], { type: 'language' })
const languageName = (code: string) => {
  try {
    return languageNames?.of(code.toLowerCase()) ?? code
  } catch {
    return code
  }
}

/** A card under (or above) the selection with its translation (DeepL through the server). */
export function TranslationCard({
  text,
  rect,
  target,
  onTargetChange,
  onClose,
}: {
  text: string
  rect: DOMRect
  target: TranslateTarget
  onTargetChange: (target: TranslateTarget) => void
  onClose: () => void
}) {
  const card = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: rect.left, top: rect.bottom + 8 })
  const [copied, setCopied] = useState(false)
  const clipped = text.length > TRANSLATE_TEXT_MAX
  const source = clipped ? text.slice(0, TRANSLATE_TEXT_MAX) : text
  const result = useQuery({
    queryKey: ['translate', target, source],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => unwrap(api.POST('/api/translate', { body: { text: source, target } })),
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text arrives and the card grows
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8,
    )
    const below = rect.bottom + 8
    const top = below + height < window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 8)
    setPos({ left, top })
  }, [rect, result.data, result.isError])

  return (
    <div
      ref={card}
      role="dialog"
      aria-label="Translation"
      className="fixed z-30 flex w-[min(24rem,calc(100vw-1rem))] flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">
          {result.data?.detectedSource
            ? `${languageName(result.data.detectedSource)} →`
            : 'Translate to'}
        </span>
        <select
          aria-label="Translate to"
          value={target}
          onChange={(e) => onTargetChange(e.target.value as TranslateTarget)}
          className="rounded-md border bg-background px-1.5 py-0.5 text-xs"
        >
          {TRANSLATE_TARGETS.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <Button size="icon-xs" variant="ghost" aria-label="Close translation" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <div className="max-h-[40vh] overflow-y-auto text-sm leading-relaxed">
        {result.isPending ? (
          <p className="text-muted-foreground">Translating…</p>
        ) : result.isError ? (
          <p className="text-destructive-foreground">{result.error.message}</p>
        ) : (
          <p lang={target.toLowerCase()} className="whitespace-pre-line">
            {result.data.text}
          </p>
        )}
      </div>
      {clipped && (
        <p className="text-muted-foreground text-xs">
          Only the first {TRANSLATE_TEXT_MAX.toLocaleString()} characters were translated.
        </p>
      )}
      {result.data && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Translated by DeepL</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(result.data.text)
              setCopied(true)
            }}
          >
            <CopyIcon />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
    </div>
  )
}
