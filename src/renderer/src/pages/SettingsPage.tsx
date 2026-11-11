import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { UpdateState } from '@shared/types'
import { errMsg, timeAgo } from '../util'

const RELEASES = 'https://github.com/wojoe-444/Local-Repo-UI/releases'

function UpdatesBox(): JSX.Element {
  const [st, setSt] = useState<UpdateState | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const off = window.api.onUpdateState(setSt)
    window.api.updateGetState().then(setSt, (e) => setErr(errMsg(e)))
    return off
  }, [])

  const run = (p: Promise<unknown>): void => { setErr(null); p.catch((e) => setErr(errMsg(e))) }
  const status = st?.status
  const busy = status === 'checking' || status === 'downloading'

  return (
    <div className="box">
      <div className="box-head"><strong>Updates</strong></div>
      <div className="pad update-box">
        <div>Local Repo UI <strong>{st ? `v${st.currentVersion}` : '…'}</strong></div>

        {status === 'unsupported' && <div className="muted">Updates are only available in the installed app. This is a development run.</div>}
        {status === 'idle' && <div className="muted">Checking contacts GitHub (the app’s releases) and sends nothing about you or your repositories.</div>}
        {status === 'checking' && <div className="muted">Checking for updates…</div>}
        {status === 'up-to-date' && <div className="flash ok">You’re up to date.{st?.checkedAt ? <span className="muted small"> Checked {timeAgo(new Date(st.checkedAt).toISOString())}.</span> : null}</div>}
        {status === 'available' && (
          <div className="flash info">
            <strong>Version {st?.version} is available.</strong>{' '}
            <button type="button" className="linklike" onClick={() => window.api.openExternal(`${RELEASES}/tag/v${encodeURIComponent(st?.version ?? '')}`).catch(() => undefined)}>What’s new</button>
          </div>
        )}
        {status === 'downloading' && (
          <div>
            <div className="muted">Downloading version {st?.version}… {st?.percent ?? 0}%</div>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={st?.percent ?? 0}><span style={{ width: `${st?.percent ?? 0}%` }} /></div>
          </div>
        )}
        {status === 'downloaded' && <div className="flash ok">Version {st?.version} is downloaded and ready. The app will close and reopen on the new version.</div>}
        {status === 'error' && <div className="flash error">{st?.error}</div>}
        {err && <div className="flash error">{err}</div>}

        <div className="update-actions">
          {status === 'downloaded'
            ? <button className="btn primary" onClick={() => run(window.api.updateInstall())}>Restart and update</button>
            : (status === 'available' || (status === 'error' && st?.version))
              ? <button className="btn primary" disabled={busy} onClick={() => run(window.api.updateDownload())}>Download version {st?.version}</button>
              : null}
          {status !== 'downloaded' && status !== 'unsupported' && (
            <button className="btn" disabled={!st || busy} onClick={() => run(window.api.updateCheck())}>{status === 'checking' ? 'Checking…' : 'Check for updates'}</button>
          )}
        </div>
        {status !== 'unsupported' && <div className="muted small">Updates are downloaded from the app’s GitHub releases and checked against a SHA-512 hash before install. Nothing is checked in the background.</div>}
      </div>
    </div>
  )
}

export default function SettingsPage(): JSX.Element {
  return (
    <div>
      <header className="topbar">
        <Link to="/" className="brand" title="Home">Local Repo UI</Link>
        <span className="muted">/</span>
        <strong>Settings</strong>
      </header>
      <main className="container settings"><UpdatesBox /></main>
    </div>
  )
}
