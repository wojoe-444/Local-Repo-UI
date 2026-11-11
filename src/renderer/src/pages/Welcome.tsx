import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GithubRepo } from '@shared/types'
import { loadRecents, useRepo } from '../RepoContext'
import { useAuth } from '../AuthContext'
import { GithubIcon, LockIcon, RepoIcon } from '../components/Icons'
import AccountMenu from '../components/AccountMenu'
import SignInPanel from '../components/SignInPanel'
import { timeAgo } from '../util'

type Scope = 'all' | 'yours' | 'orgs' | 'shared'

function GithubRepos(): JSX.Element {
  const { openGithub } = useRepo()
  const auth = useAuth()
  const nav = useNavigate()
  const [filter, setFilter] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const me = auth.status?.login?.toLowerCase()

  const inScope = (r: GithubRepo): boolean =>
    scope === 'all' || (scope === 'yours' && r.owner.toLowerCase() === me) || (scope === 'orgs' && r.ownerType === 'Organization') ||
    (scope === 'shared' && r.ownerType === 'User' && r.owner.toLowerCase() !== me)
  const shown = (auth.repos ?? []).filter((r) => inScope(r) && (r.fullName + ' ' + (r.description ?? '')).toLowerCase().includes(filter.trim().toLowerCase()))
  const go = (r: GithubRepo): void => { openGithub(r).then(() => nav(r.clonePath ? '/repo/tree' : '/repo/issues')) }

  return (
    <div className="box recents">
      <div className="box-head">
        <GithubIcon /> <strong>GitHub repositories</strong>
        <span className="spacer" />
        <button className="btn" onClick={() => auth.loadRepos(true)} disabled={auth.reposLoading}>{auth.reposLoading ? 'Loading…' : 'Refresh'}</button>
      </div>
      <div className="repo-filter">
        <input className="search" placeholder="Find a repository…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="seg">
          {([['all', 'All'], ['yours', 'Yours'], ['orgs', 'Organizations'], ['shared', 'Shared with you']] as [Scope, string][]).map(([k, label]) => (
            <button key={k} className={scope === k ? 'active' : ''} onClick={() => setScope(k)}>{label}</button>
          ))}
        </span>
      </div>
      {auth.reposError && <div className="flash error">{auth.reposError}</div>}
      {shown.map((r) => (
        <button className="row-link repo-row" key={r.fullName} onClick={() => go(r)}>
          <span className="repo-row-main">
            <span><RepoIcon /> <strong>{r.fullName}</strong>{r.private && <span className="badge"><LockIcon /> Private</span>}{r.archived && <span className="badge">Archived</span>}{r.fork && <span className="badge">Fork</span>}{r.clonePath && <span className="badge" title={r.clonePath}>Local clone</span>}</span>
            {r.description && <span className="muted small ellipsis">{r.description}</span>}
          </span>
          {r.pushedAt && <span className="muted small nowrap">updated {timeAgo(r.pushedAt)}</span>}
        </button>
      ))}
      {auth.repos && shown.length === 0 && <div className="pad center muted">No repositories match.</div>}
      {!auth.repos && auth.reposLoading && <div className="pad center muted">Loading your repositories…</div>}
    </div>
  )
}

export default function Welcome(): JSX.Element {
  const { open, pick, error } = useRepo()
  const auth = useAuth()
  const nav = useNavigate()
  const signedIn = !!auth.status?.signedIn
  useEffect(() => { if (signedIn) auth.loadRepos().catch(() => undefined) }, [signedIn]) // eslint-disable-line react-hooks/exhaustive-deps
  const go = (dir: string): void => { open(dir).then(() => nav('/repo/tree'), () => undefined) }
  const recents = loadRecents()
  return (
    <div className="welcome">
      <div className="welcome-top"><span className="spacer" /><AccountMenu hideSignIn /></div>
      <h1>Local Repo UI</h1>
      <p className="muted">Browse any local git repository the way you would on GitHub. Local-only repositories never leave this machine. Repositories on GitHub work live once you sign in.</p>
      <button className="btn primary big" onClick={() => pick().then(() => nav('/repo/tree'), () => undefined)}>Open a repository…</button>
      {error && <div className="flash error">{error}</div>}
      {/* Signing in comes first, right under the open button, so it is never pushed below a long list of recents. */}
      {auth.statusError && (
        <div className="flash error">
          Could not read your GitHub account state: {auth.statusError}. If you just updated the app, quit it completely and start it again.
        </div>
      )}
      {auth.status && !signedIn && <div className="left"><SignInPanel /></div>}
      {recents.length > 0 && (
        <div className="box recents">
          <div className="box-head">Recent local repositories</div>
          {recents.map((p) => (
            <button className="row-link" key={p} onClick={() => go(p)}><RepoIcon /> <span className="mono">{p}</span></button>
          ))}
        </div>
      )}
      {signedIn && <GithubRepos />}
    </div>
  )
}
