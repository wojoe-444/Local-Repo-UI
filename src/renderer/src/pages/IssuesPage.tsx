import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Issue, IssueLabel, IssueTarget } from '@shared/types'
import { useAsync, useRepo } from '../RepoContext'
import { IssueGate, IssueSourceBar } from '../components/IssueSource'
import { LabelPicker, LabelPill } from '../components/Labels'
import { CommentIcon, IssueClosedIcon, IssueOpenIcon, IssueSkippedIcon, PlusIcon } from '../components/Icons'
import { issueLink, issuesLink, newIssueLink } from '../links'
import { fullDate, timeAgo } from '../util'

export function IssueStateIcon({ issue }: { issue: Pick<Issue, 'state' | 'stateReason'> }): JSX.Element {
  if (issue.state === 'open') return <span className="issue-icon open" title="Open"><IssueOpenIcon /></span>
  return issue.stateReason === 'not_planned'
    ? <span className="issue-icon skipped" title="Closed as not planned"><IssueSkippedIcon /></span>
    : <span className="issue-icon closed" title="Closed as completed"><IssueClosedIcon /></span>
}

function IssueRow({ issue }: { issue: Issue }): JSX.Element {
  return (
    <div className="issue-row">
      <IssueStateIcon issue={issue} />
      <div className="issue-main">
        <Link className="issue-title" to={issueLink(issue.number)}>{issue.title}</Link>
        {issue.labels.map((l) => <LabelPill key={l.name} label={l} />)}
        <div className="muted small">
          #{issue.number}{' '}
          {issue.state === 'open'
            ? <>opened <span title={fullDate(issue.createdAt)}>{timeAgo(issue.createdAt)}</span> by {issue.author.login}</>
            : <>by {issue.author.login} was closed <span title={fullDate(issue.closedAt ?? issue.updatedAt)}>{timeAgo(issue.closedAt ?? issue.updatedAt)}</span>{issue.stateReason === 'not_planned' ? ' as not planned' : ''}</>}
        </div>
      </div>
      {issue.comments > 0 && <Link className="muted comments" to={issueLink(issue.number)} title={`${issue.comments} comments`}><CommentIcon /> {issue.comments}</Link>}
    </div>
  )
}

function IssueList({ target }: { target: IssueTarget }): JSX.Element {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const state = sp.get('state') === 'closed' ? 'closed' : 'open'
  const q = sp.get('q') ?? ''
  const labels = sp.getAll('label')
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const [qInput, setQInput] = useState(q)
  useEffect(() => setQInput(q), [q])
  const key = JSON.stringify(target)

  const list = useAsync(() => window.api.issuesList(target, { state, labels, query: q, page }), [key, state, q, labels.join('\n'), page])
  const labelSet = useAsync(() => window.api.labelsList(target).catch(() => [] as IssueLabel[]), [key])
  const go = (o: Parameters<typeof issuesLink>[0]): void => { void nav(issuesLink({ state, q, labels, ...o })) }
  const counts = list.data?.counts

  return (
    <div>
      <div className="toolbar">
        <form className="grow" onSubmit={(e) => { e.preventDefault(); go({ q: qInput.trim(), page: 1 }) }}>
          <input className="search wide" placeholder="Search issues" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </form>
        <LabelPicker all={labelSet.data ?? []} selected={labels} onChange={(l) => go({ labels: l, page: 1 })} caption={labels.length ? `Labels (${labels.length})` : 'Labels'} />
        <Link className="btn primary" to={newIssueLink()}><PlusIcon /> New issue</Link>
      </div>
      {(q || labels.length > 0) && (
        <div className="muted small filters">
          Filtered{q && <> by “{q}”</>}{labels.length > 0 && <> by label {labels.join(', ')}</>} ·{' '}
          <Link to={issuesLink({ state })}>Clear filters</Link>
        </div>
      )}
      <div className="box">
        <div className="box-head issue-tabs">
          <Link className={state === 'open' ? 'active' : ''} to={issuesLink({ q, labels })}><IssueOpenIcon /> {counts ? `${counts.open} ` : ''}Open</Link>
          <Link className={state === 'closed' ? 'active' : ''} to={issuesLink({ state: 'closed', q, labels })}><IssueClosedIcon /> {counts ? `${counts.closed} ` : ''}Closed</Link>
        </div>
        {list.error && <div className="flash error">{list.error}</div>}
        {list.data?.issues.map((i) => <IssueRow key={i.number} issue={i} />)}
        {list.data && list.data.issues.length === 0 && (
          <div className="pad center muted">
            {q || labels.length ? 'No issues match your search.' : state === 'open' ? 'There are no open issues.' : 'There are no closed issues.'}
          </div>
        )}
        {list.loading && !list.data && <div className="pad center muted">Loading…</div>}
      </div>
      {list.data && (page > 1 || list.data.hasNext) && (
        <div className="pager">
          <button className="btn" disabled={page <= 1} onClick={() => go({ page: page - 1 })}>Previous</button>
          <span className="muted">Page {page}</span>
          <button className="btn" disabled={!list.data.hasNext} onClick={() => go({ page: page + 1 })}>Next</button>
        </div>
      )}
    </div>
  )
}

export default function IssuesPage(): JSX.Element {
  const { issueTarget } = useRepo()
  return (
    <div>
      <IssueSourceBar />
      <IssueGate>{issueTarget ? <IssueList target={issueTarget} /> : <></>}</IssueGate>
    </div>
  )
}
