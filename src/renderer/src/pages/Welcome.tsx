import { useNavigate } from 'react-router-dom'
import { loadRecents, useRepo } from '../RepoContext'
import { RepoIcon } from '../components/Icons'

export default function Welcome(): JSX.Element {
  const { open, pick, error } = useRepo()
  const nav = useNavigate()
  const go = (dir: string): void => { open(dir).then(() => nav('/repo/tree'), () => undefined) }
  const recents = loadRecents()
  return (
    <div className="welcome">
      <h1>Local Repo UI</h1>
      <p className="muted">Browse any local git repository the way you would on GitHub. Nothing leaves this machine.</p>
      <button className="btn primary big" onClick={() => pick().then(() => nav('/repo/tree'), () => undefined)}>Open a repository…</button>
      {error && <div className="flash error">{error}</div>}
      {recents.length > 0 && (
        <div className="box recents">
          <div className="box-head">Recent repositories</div>
          {recents.map((p) => (
            <button className="row-link" key={p} onClick={() => go(p)}><RepoIcon /> <span className="mono">{p}</span></button>
          ))}
        </div>
      )}
    </div>
  )
}
