import { useRepo } from '../RepoContext'

/** Shown for code tabs when a GitHub repository has no linked local clone. */
export default function ClonePage(): JSX.Element {
  const { remote, linkClone, error } = useRepo()
  if (!remote) return <div className="box pad">No repository is open.</div>
  return (
    <div className="box pad">
      <h2>No local clone linked</h2>
      <p>
        Issues for <strong>{remote.owner}/{remote.name}</strong> work live through GitHub. To browse its code, commits and branches here,
        link a local clone of it. The app reads the clone with git on your machine; nothing is downloaded.
      </p>
      {error && <div className="flash error">{error}</div>}
      <button className="btn primary" onClick={() => linkClone()}>Link a local clone…</button>{' '}
      {remote.info?.htmlUrl && <button className="btn" onClick={() => window.api.openExternal(remote.info!.htmlUrl)}>Open on github.com</button>}
    </div>
  )
}
