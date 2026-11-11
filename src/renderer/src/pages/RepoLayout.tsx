import { Link, NavLink, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useRepo } from '../RepoContext'
import { RepoIcon, CodeIcon, CommitIcon, BranchIcon, CompareIcon, IssueOpenIcon } from '../components/Icons'
import { RepoBadge } from '../components/IssueSource'
import AccountMenu from '../components/AccountMenu'
import { commitsLink, compareLink, issuesLink, treeLink } from '../links'

export default function RepoLayout(): JSX.Element {
  const { repo, remote, refresh, pick } = useRepo()
  const nav = useNavigate()
  const { pathname } = useLocation()
  if (!repo && !remote) return <Navigate to="/" replace />
  const ref = repo?.defaultRef ?? 'HEAD'
  const title = repo?.name ?? remote!.name
  const onIssues = pathname.startsWith('/repo/issues')
  return (
    <div>
      <header className="topbar">
        <Link to="/" className="brand" title="Home">Local Repo UI</Link>
        <span className="spacer" />
        {repo && <button className="btn" onClick={() => refresh()} title="Re-read branches from disk">Refresh</button>}
        <button className="btn" onClick={() => pick().then(() => nav('/repo/tree'))}>Open…</button>
        <AccountMenu />
      </header>
      <div className="repo-head">
        <div className="repo-title"><RepoIcon /> <strong>{title}</strong> <RepoBadge /></div>
        {repo && <div className="muted small mono">{repo.path}</div>}
        <nav className="tabs">
          {repo
            ? <NavLink to={treeLink(ref, '')} className={({ isActive }) => (isActive ? 'active' : '')} end={false}><CodeIcon /> Code</NavLink>
            : <NavLink to="/repo/clone"><CodeIcon /> Code</NavLink>}
          <NavLink to={issuesLink()}><IssueOpenIcon /> Issues</NavLink>
          {repo && <NavLink to={commitsLink(ref)}><CommitIcon /> Commits</NavLink>}
          {repo && <NavLink to="/repo/branches"><BranchIcon /> Branches</NavLink>}
          {repo && <NavLink to={compareLink()}><CompareIcon /> Compare</NavLink>}
        </nav>
      </div>
      <main className="container">
        {repo?.isEmpty && !onIssues ? <div className="box pad">This repository has no commits yet.</div> : <Outlet />}
      </main>
    </div>
  )
}
