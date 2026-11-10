import { Link, NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom'
import { useRepo } from '../RepoContext'
import { RepoIcon, CodeIcon, CommitIcon, BranchIcon, CompareIcon } from '../components/Icons'
import { commitsLink, compareLink, treeLink } from '../links'

export default function RepoLayout(): JSX.Element {
  const { repo, refresh, pick } = useRepo()
  const nav = useNavigate()
  if (!repo) return <Navigate to="/" replace />
  const ref = repo.defaultRef ?? 'HEAD'
  return (
    <div>
      <header className="topbar">
        <Link to="/" className="brand" title="Home">Local Repo UI</Link>
        <span className="spacer" />
        <button className="btn" onClick={() => refresh()} title="Re-read branches from disk">Refresh</button>
        <button className="btn" onClick={() => pick().then(() => nav('/repo/tree'))}>Open…</button>
      </header>
      <div className="repo-head">
        <div className="repo-title"><RepoIcon /> <strong>{repo.name}</strong> <span className="badge">Local</span></div>
        <div className="muted small mono">{repo.path}</div>
        <nav className="tabs">
          <NavLink to={treeLink(ref, '')} className={({ isActive }) => (isActive ? 'active' : '')} end={false}><CodeIcon /> Code</NavLink>
          <NavLink to={commitsLink(ref)}><CommitIcon /> Commits</NavLink>
          <NavLink to="/repo/branches"><BranchIcon /> Branches</NavLink>
          <NavLink to={compareLink()}><CompareIcon /> Compare</NavLink>
        </nav>
      </div>
      <main className="container">
        {repo.isEmpty ? <div className="box pad">This repository has no commits yet.</div> : <Outlet />}
      </main>
    </div>
  )
}
