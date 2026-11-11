import { useAuth } from '../AuthContext'
import { useRepo } from '../RepoContext'
import SignInPanel from './SignInPanel'
import { GithubIcon, LockIcon, RepoIcon } from './Icons'

/** Banner saying where issues live, with the switch between GitHub and local-only for repos that have a github.com remote. */
export function IssueSourceBar(): JSX.Element | null {
  const { issueTarget, remote, repo, localOnly, setLocalOnly } = useRepo()
  if (!issueTarget) return null
  const slug = remote ? `${remote.owner}/${remote.name}` : null
  return (
    <div className={`source-bar ${issueTarget.kind}`}>
      {issueTarget.kind === 'github'
        ? <><GithubIcon /> <span><strong>Live on GitHub</strong> · {slug}. Changes here are made on github.com straight away.</span></>
        : <><LockIcon /> <span><strong>Local only</strong> · issues are stored on this computer and are never uploaded.</span></>}
      <span className="spacer" />
      {repo && slug && issueTarget.kind === 'github' && (
        <button type="button" className="linklike" onClick={() => setLocalOnly(true)}>Keep this repository’s issues local-only</button>
      )}
      {repo && slug && localOnly && (
        <button type="button" className="linklike" onClick={() => setLocalOnly(false)}>Use {slug} issues on GitHub</button>
      )}
    </div>
  )
}

/** Renders `children` once issue operations can run; otherwise explains what is missing. */
export function IssueGate({ children }: { children: JSX.Element }): JSX.Element {
  const { issueTarget, remote, repo, setLocalOnly } = useRepo()
  const auth = useAuth()
  if (!issueTarget) return <div className="box pad">No repository is open.</div>
  if (issueTarget.kind === 'github' && auth.status && !auth.status.signedIn) {
    return (
      <div>
        <div className="flash warn">
          <strong>{remote?.owner}/{remote?.name}</strong> is on GitHub, so its issues live there. Sign in to use them.
          {repo && <> Or <button type="button" className="linklike" onClick={() => setLocalOnly(true)}>keep this repository’s issues local-only</button>.</>}
        </div>
        <SignInPanel />
      </div>
    )
  }
  if (issueTarget.kind === 'github' && !auth.status) return <div className="muted pad">Loading…</div>
  return children
}

export function RepoBadge(): JSX.Element | null {
  const { repo, remote, issueTarget } = useRepo()
  if (!repo && !remote) return null
  return (
    <>
      {remote?.info?.private && <span className="badge"><LockIcon /> Private</span>}
      {remote
        ? <span className="badge" title={repo ? 'Local checkout linked to GitHub' : 'GitHub repository'}><GithubIcon /> {remote.owner}/{remote.name}</span>
        : <span className="badge"><RepoIcon /> Local</span>}
      {issueTarget?.kind === 'local' && remote && <span className="badge">issues: local-only</span>}
    </>
  )
}
