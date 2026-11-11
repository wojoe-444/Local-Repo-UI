import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { IssueTarget } from '@shared/types'
import { useAsync, useRepo } from '../RepoContext'
import { IssueGate, IssueSourceBar } from '../components/IssueSource'
import { LabelPicker, LabelPill } from '../components/Labels'
import Composer from '../components/Composer'
import { issueLink, issuesLink } from '../links'
import { errMsg } from '../util'

function NewIssueForm({ target }: { target: IssueTarget }): JSX.Element {
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [assignSelf, setAssignSelf] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const all = useAsync(() => window.api.labelsList(target), [JSON.stringify(target), nonce])
  const live = target.kind === 'github'

  const submit = (): void => {
    setBusy(true)
    setError(null)
    window.api.issuesCreate(target, { title, body, labels, assignSelf: live && assignSelf }).then(
      (i) => nav(issueLink(i.number)),
      (e) => { setError(errMsg(e)); setBusy(false) }
    )
  }

  return (
    <form className="new-issue" onSubmit={(e) => { e.preventDefault(); if (title.trim() && !busy) submit() }}>
      <div className="issue-grid">
        <div>
          <input className="title-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={256} autoFocus />
          <Composer value={body} onChange={setBody} placeholder="Leave a comment" rows={12} />
          {error && <div className="flash error">{error}</div>}
          {live && <div className="muted small">This creates a real issue on github.com.</div>}
          <div className="form-actions">
            <Link className="btn" to={issuesLink()}>Cancel</Link>
            <button className="btn primary" type="submit" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Submit new issue'}</button>
          </div>
        </div>
        <aside className="issue-side">
          <div className="side-section">
            <LabelPicker
              all={all.data ?? []} selected={labels} onChange={setLabels}
              onCreate={async (input) => { await window.api.labelsCreate(target, input); setLabels((l) => [...l, input.name]); setNonce((n) => n + 1) }}
            />
            <div className="side-list">
              {labels.length === 0 && <span className="muted small">No labels</span>}
              {labels.map((n) => { const l = all.data?.find((x) => x.name === n); return l ? <LabelPill key={n} label={l} /> : <span key={n} className="badge">{n}</span> })}
            </div>
          </div>
          {live && (
            <div className="side-section">
              <label className="small"><input type="checkbox" checked={assignSelf} onChange={(e) => setAssignSelf(e.target.checked)} /> Assign to me</label>
            </div>
          )}
        </aside>
      </div>
    </form>
  )
}

export default function NewIssuePage(): JSX.Element {
  const { issueTarget } = useRepo()
  return (
    <div>
      <IssueSourceBar />
      <IssueGate>{issueTarget ? <NewIssueForm key={JSON.stringify(issueTarget)} target={issueTarget} /> : <></>}</IssueGate>
    </div>
  )
}
