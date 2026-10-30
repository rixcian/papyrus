import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TocItem } from '@/vendor/foliate-js/view.js'
import { FONT_SIZES, LINE_HEIGHTS, READER_THEMES, type ReaderPrefs } from './prefs'

export function TocList({
  items,
  current,
  onPick,
  depth = 0,
}: {
  items: TocItem[]
  current: string | undefined
  onPick: (href: string) => void
  depth?: number
}) {
  return (
    <ul className={cn(depth > 0 && 'ms-3 border-s ps-2')}>
      {items.map((item) => (
        <li key={`${item.href}-${item.label}`}>
          <button
            type="button"
            onClick={() => onPick(item.href)}
            className={cn(
              'w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent',
              current === item.href && 'bg-accent font-medium',
            )}
          >
            {item.label.trim() || 'Untitled'}
          </button>
          {item.subitems?.length ? (
            <TocList items={item.subitems} current={current} onPick={onPick} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function Options<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-medium text-sm">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Button
            key={String(o.value)}
            size="sm"
            variant={o.value === value ? 'default' : 'outline'}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}

function Stepper({
  label,
  values,
  value,
  format,
  onChange,
}: {
  label: string
  values: number[]
  value: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const index = Math.max(0, values.indexOf(value))
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={`Decrease ${label}`}
          disabled={index === 0}
          onClick={() => onChange(values[index - 1] as number)}
        >
          −
        </Button>
        <span className="w-12 text-center text-sm tabular-nums">{format(value)}</span>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={`Increase ${label}`}
          disabled={index === values.length - 1}
          onClick={() => onChange(values[index + 1] as number)}
        >
          +
        </Button>
      </div>
    </div>
  )
}

export function TypographyPanel({
  prefs,
  onChange,
}: {
  prefs: ReaderPrefs
  onChange: (p: Partial<ReaderPrefs>) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <Options
        label="Theme"
        value={prefs.theme}
        options={Object.entries(READER_THEMES).map(([value, t]) => ({
          value: value as ReaderPrefs['theme'],
          label: t.label,
        }))}
        onChange={(theme) => onChange({ theme })}
      />
      <Options
        label="Font"
        value={prefs.font}
        options={[
          { value: 'publisher', label: 'Original' },
          { value: 'serif', label: 'Serif' },
          { value: 'sans', label: 'Sans' },
        ]}
        onChange={(font) => onChange({ font })}
      />
      <Stepper
        label="Size"
        values={FONT_SIZES}
        value={prefs.fontSize}
        format={(v) => `${v}%`}
        onChange={(fontSize) => onChange({ fontSize })}
      />
      <Stepper
        label="Line spacing"
        values={LINE_HEIGHTS}
        value={prefs.lineHeight}
        format={(v) => v.toFixed(1)}
        onChange={(lineHeight) => onChange({ lineHeight })}
      />
      <Options
        label="Margins"
        value={prefs.margin}
        options={[
          { value: 'narrow', label: 'Narrow' },
          { value: 'normal', label: 'Normal' },
          { value: 'wide', label: 'Wide' },
        ]}
        onChange={(margin) => onChange({ margin })}
      />
      <Options
        label="Layout"
        value={prefs.flow}
        options={[
          { value: 'paginated', label: 'Pages' },
          { value: 'scrolled', label: 'Scroll' },
        ]}
        onChange={(flow) => onChange({ flow })}
      />
    </div>
  )
}
