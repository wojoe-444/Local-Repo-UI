import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Issue, IssueTarget, IssueUser } from '@shared/types'
import { useAsync, useRepo } from '../RepoContext'
import { IssueGate, IssueSourceBar } from '../components/IssueSource'
import { LabelPicker, LabelPill } from '../components/Labels'
import Composer from '../components/Composer'
import IssueMarkdown from '../components/IssueMarkdown'
import UserAvatar from '../components/UserAvatar'
import { IssueClosedIcon, IssueOpenIcon, IssueSkippedIcon, PencilIcon, PlusIcon } from '../components/Icons'
import { IssueStateIcon } from './IssuesPage'
import { issuesLink, newIssueLink } from '../links'
import { errMsg, fullDate, timeAgo } from '../util'

function StatePill({ issue }: { issue: Issue }): JSX.Element {
  if (issue.state === 'open') return <span className="state-pill open"><IssueOpenIcon /> Open</span>
  return issue.stateReason === 'not_planned'
    ? <span className="state-pill skipped"><IssueSkippedIcon /> Closed as not planned</span>
    : <span className="state-pill closed"><IssueClosedIcon /> Closed</span>
}

function CommentBox({ author, when, body, onEdit }: { author: IssueUser; when: string; body: string; onEdit?: () => void }): JSX.Element {
  return (
    <div className="comment">
      <UserAvatar user={author} size={40} />
      <div className="box comment-box">
        <div className="box-head">
          <strong>{author.login}</strong> <span className="muted">commented <span title={fullDate(when)}>{timeAgo(when)}</span></span>
          <span className="spacer" />
          {onEdit && <button type="button" className="btn icon" onClick={onEdit} title="Edit"><PencilIcon /></button>}
        </div>
        <div className="pad"><IssueMarkdown source={body} /></div>
      </div>
    </div>
  )
}

function IssueView({ target, number }: { target: IssueTarget; number: number }): JSX.Element {
  const [nonce, setNonce] = useState(0)
  const key = JSON.stringify(target)
  const detail = useAsync(() => window.api.issuesGet(target, number), [key, number, nonce])
  const [labelNonce, setLabelNonce] = useState(0)
  const allLabels = useAsync(() => window.api.labelsList(target).catch(() => []), [key, labelNonce])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState<string | null>(null)
  const [editBody, setEditBody] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  /** Runs one operation, then reloads the issue. */
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try { await fn(); setNonce((n) => n + 1); return true } catch (e) { setError(errMsg(e)); return false } finally { setBusy(false) }
  }

  if (detail.error) return <div><div className="flash error">{detail.error}</div><Link to={issuesLink()}>Back to issues</Link></div>
  if (!detail.data) return <div className="muted pad">Loading…</div>
  const { issue, timeline, truncated } = detail.data

  const changeState = (state: 'open' | 'closed', stateReason?: 'completed' | 'not_planned'): Promise<boolean> =>
    run(async () => {
      if (comment.trim()) { await window.api.issuesComment(target, number, comment); setComment('') }
      await window.api.issuesUpdate(target, number, { state, stateReason })
    })

  return (
    <div>
      <div className="issue-header">
        {editTitle === null ? (
          <h1 className="issue-heading">
            {issue.title} <span className="muted">#{issue.number}</span>
            <button type="button" className="btn icon" title="Edit title" onClick={() => setEditTitle(issue.title)}><PencilIcon /></button>
            <span className="spacer" />
            <Link className="btn primary" to={newIssueLink()}><PlusIcon /> New issue</Link>
          </h1>
        ) : (
          <form className="title-edit" onSubmit={(e) => { e.preventDefault(); run(() => window.api.issuesUpdate(target, number, { title: editTitle })).then((ok) => ok && setEditTitle(null)) }}>
            <input className="title-input" value={editTitle} maxLength={256} autoFocus onChange={(e) => setEditTitle(e.target.value)} />
            <button className="btn primary" type="submit" disabled={busy || !editTitle.trim()}>Save</button>
            <button className="btn" type="button" onClick={() => setEditTitle(null)}>Cancel</button>
          </form>
        )}
        <div className="issue-meta">
          <StatePill issue={issue} />
          <span className="muted"><strong>{issue.author.login}</strong> opened this issue <span title={fullDate(issue.createdAt)}>{timeAgo(issue.createdAt)}</span> · {issue.comments} comment{issue.comments === 1 ? '' : 's'}</span>
        </div>
      </div>
      {error && <div className="flash error">{error}</div>}
      <div className="issue-grid">
        <div className="timeline">
          {editBody === null
            ? <CommentBox author={issue.author} when={issue.createdAt} body={issue.body} onEdit={() => setEditBody(issue.body)} />
            : (
              <div className="comment-edit">
                <Composer value={editBody} onChange={setEditBody} rows={10} autoFocus />
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setEditBody(null)}>Cancel</button>
                  <button className="btn primary" type="button" disabled={busy} onClick={() => run(() => window.api.issuesUpdate(target, number, { body: editBody })).then((ok) => ok && setEditBody(null))}>Update comment</button>
                </div>
              </div>
            )}
          {timeline.map((t) => t.type === 'comment'
            ? <CommentBox key={`c${t.id}`} author={t.author} when={t.createdAt} body={t.body} />
            : (
              <div className="event" key={`e${t.id}${t.createdAt}`}>
                <span className={`event-badge ${t.event === 'closed' ? (t.stateReason === 'not_planned' ? 'skipped' : 'closed') : 'open'}`}>
                  {t.event === 'closed' ? (t.stateReason === 'not_planned' ? <IssueSkippedIcon /> : <IssueClosedIcon />) : <IssueOpenIcon />}
                </span>
                <span className="muted"><strong>{t.actor.login}</strong> {t.event === 'closed' ? `closed this as ${t.stateReason === 'not_planned' ? 'not planned' : 'completed'}` : 'reopened this'} <span title={fullDate(t.createdAt)}>{timeAgo(t.createdAt)}</span></span>
              </div>
            ))}
          {truncated && <div className="flash warn small">Only the first comments are shown. {issue.htmlUrl && <button type="button" className="linklike" onClick={() => window.api.openExternal(issue.htmlUrl!)}>View the rest on GitHub</button>}</div>}

          <div className="comment new-comment">
            <div className="avatar-spacer" />
            <div className="comment-form">
              <Composer value={comment} onChange={setComment} placeholder="Leave a comment" rows={6} />
              <div className="form-actions">
                {issue.state === 'open' ? (
                  <>
                    <button className="btn" type="button" disabled={busy} onClick={() => changeState('closed', 'completed')}><IssueClosedIcon /> {comment.trim() ? 'Close with comment' : 'Close issue'}</button>
                    <button className="btn" type="button" disabled={busy} onClick={() => changeState('closed', 'not_planned')} title="Close as not planned"><IssueSkippedIcon /> Not planned</button>
                  </>
                ) : (
                  <button className="btn" type="button" disabled={busy} onClick={() => changeState('open')}><IssueOpenIcon /> {comment.trim() ? 'Reopen with comment' : 'Reopen issue'}</button>
                )}
                <button className="btn primary" type="button" disabled={busy || !comment.trim()} onClick={() => run(async () => { await window.api.issuesComment(target, number, comment); setComment('') })}>Comment</button>
              </div>
            </div>
          </div>
        </div>

        <aside className="issue-side">
          <div className="side-section">
            <div className="side-title">Labels</div>
            <LabelPicker
              all={allLabels.data ?? []} selected={issue.labels.map((l) => l.name)}
              onChange={(names) => { run(() => window.api.issuesUpdate(target, number, { labels: names })) }}
              onCreate={async (input) => { await window.api.labelsCreate(target, input); setLabelNonce((n) => n + 1) }}
              caption="Edit labels"
            />
            <div className="side-list">
              {issue.labels.length === 0 && <span className="muted small">None yet</span>}
              {issue.labels.map((l) => <LabelPill key={l.name} label={l} />)}
            </div>
          </div>
          {target.kind === 'github' && (
            <div className="side-section">
              <div className="side-title">Assignees</div>
              <div className="side-list">
                {issue.assignees.length === 0 && <span className="muted small">No one assigned</span>}
                {issue.assignees.map((a) => <span key={a.login} className="assignee"><UserAvatar user={a} /> {a.login}</span>)}
              </div>
            </div>
          )}
          <div className="side-section">
            <div className="side-title">Where this lives</div>
            {target.kind === 'github'
              ? <div className="small">GitHub: {target.owner}/{target.name}<br />{issue.htmlUrl && <button type="button" className="linklike" onClick={() => window.api.openExternal(issue.htmlUrl!)}>Open on github.com</button>}</div>
              : <div className="small muted">Stored only on this computer.</div>}
            <div className="small muted">Status: <IssueStateIcon issue={issue} /> {issue.state}</div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function IssuePage(): JSX.Element {
  const { issueTarget } = useRepo()
  const n = Number(useParams().number)
  return (
    <div>
      <IssueSourceBar />
      <IssueGate>
        {issueTarget && Number.isSafeInteger(n) && n > 0
          ? <IssueView key={`${JSON.stringify(issueTarget)}#${n}`} target={issueTarget} number={n} />
          : <div className="flash error">Invalid issue number.</div>}
      </IssueGate>
    </div>
  )
}
