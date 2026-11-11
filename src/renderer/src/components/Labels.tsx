import { useEffect, useRef, useState } from 'react'
import type { IssueLabel, LabelCreateInput } from '@shared/types'
import { TagIcon } from './Icons'

/** Black or white text, whichever reads better on the label colour. */
const textColor = (hex: string): string => {
  const n = parseInt(hex, 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#1f2328' : '#ffffff'
}

export function LabelPill({ label }: { label: IssueLabel }): JSX.Element {
  return <span className="label-pill" style={{ background: `#${label.color}`, color: textColor(label.color) }} title={label.description ?? undefined}>{label.name}</span>
}

/** Dropdown to choose labels from the repo's label set, optionally creating a new one. */
export function LabelPicker({ all, selected, onChange, onCreate, caption = 'Labels' }: {
  all: IssueLabel[]
  selected: string[]
  onChange(names: string[]): void
  onCreate?(input: LabelCreateInput): Promise<void>
  caption?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [color, setColor] = useState('#0075ca')
  const [err, setErr] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const shown = all.filter((l) => l.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const exact = all.some((l) => l.name.toLowerCase() === filter.trim().toLowerCase())
  const toggle = (name: string): void => onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name])

  return (
    <div className="refsel" ref={box}>
      <button type="button" className="btn" onClick={() => setOpen(!open)}><TagIcon /> {caption}</button>
      {open && (
        <div className="popover">
          <input autoFocus placeholder="Filter labels" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul>
            {shown.map((l) => (
              <li key={l.name}>
                <button type="button" onClick={() => toggle(l.name)}>
                  <span className="check">{selected.includes(l.name) ? '✓' : ''}</span>
                  <span className="label-dot" style={{ background: `#${l.color}` }} />
                  <span className="ellipsis">{l.name}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="muted small pad">No matching labels.</li>}
          </ul>
          {onCreate && filter.trim() && !exact && (
            <div className="label-create">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Label colour" />
              <button
                type="button"
                className="btn"
                onClick={() => onCreate({ name: filter.trim(), color }).then(() => { setFilter(''); setErr(null) }, (e: unknown) => setErr(e instanceof Error ? e.message.replace(/^Error invoking remote method '\w+': (\w*Error: )?/, '') : String(e)))}
              >
                Create “{filter.trim()}”
              </button>
              {err && <div className="flash error small">{err}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
