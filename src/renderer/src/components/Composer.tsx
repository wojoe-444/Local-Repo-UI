import { useState } from 'react'
import IssueMarkdown from './IssueMarkdown'

/** Markdown textarea with GitHub's Write / Preview tabs. */
export default function Composer({ value, onChange, placeholder, rows = 7, autoFocus }: {
  value: string
  onChange(v: string): void
  placeholder?: string
  rows?: number
  autoFocus?: boolean
}): JSX.Element {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  return (
    <div className="composer">
      <div className="tabs-mini">
        <button type="button" className={tab === 'write' ? 'active' : ''} onClick={() => setTab('write')}>Write</button>
        <button type="button" className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>Preview</button>
      </div>
      {tab === 'write'
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} autoFocus={autoFocus} />
        : <div className="composer-preview"><IssueMarkdown source={value} /></div>}
      <div className="muted small composer-hint">Markdown is supported. Images are not loaded in this app.</div>
    </div>
  )
}
