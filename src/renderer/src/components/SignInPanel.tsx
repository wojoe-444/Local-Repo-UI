import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { GithubIcon } from './Icons'
import { errMsg } from '../util'

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,read:org&description=Local%20Repo%20UI'

/** Signs in with a personal access token. The token is sent to the main process and never kept in the renderer. */
export default function SignInPanel(): JSX.Element {
  const { status, signIn, signInExisting } = useAuth()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = (): void => {
    setBusy(true)
    setError(null)
    signIn(token.trim()).then(() => setToken(''), (e) => setError(errMsg(e))).finally(() => setBusy(false))
  }

  const useExisting = (): void => {
    setBusy(true)
    setError(null)
    signInExisting().catch((e) => setError(errMsg(e))).finally(() => setBusy(false))
  }

  return (
    <div className="box signin">
      <div className="box-head"><GithubIcon /> <strong>Sign in to GitHub</strong></div>
      <div className="pad">
        <p>Sign in to see your GitHub repositories next to your local ones, including organization repositories you can access, and to work with their issues live.</p>
        <div className="existing">
          <button type="button" className="btn primary" disabled={busy} onClick={useExisting}>Use my existing GitHub login</button>
          <div className="muted small">
            Looks for a login you already have on this computer (the GitHub CLI, or the Git Credential Manager entry for github.com). It is read once when you click, then stored encrypted like a pasted token.
          </div>
        </div>
        <div className="muted small or">or use a token</div>
        <ol className="steps">
          <li>
            <button type="button" className="btn" onClick={() => window.api.openExternal(TOKEN_URL).catch(() => undefined)}>Create a token on GitHub</button>
            <div className="muted small">Pre-selects the <span className="mono">repo</span> and <span className="mono">read:org</span> scopes. If your organization uses SAML SSO, authorize the token for it afterwards. Fine-grained tokens work too, for the repositories you grant.</div>
          </li>
          <li>
            Paste it here:
            <form className="signin-form" onSubmit={(e) => { e.preventDefault(); if (token.trim() && !busy) submit() }}>
              <input type="password" autoComplete="off" spellCheck={false} placeholder="ghp_… or github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
              <button className="btn primary" type="submit" disabled={busy || !token.trim()}>{busy ? 'Signing in…' : 'Sign in'}</button>
            </form>
          </li>
        </ol>
        {error && <div className="flash error">{error}</div>}
        {status && !status.canPersist
          ? <div className="flash warn small">Secure storage is not available on this system, so the token will only be kept until you close the app.</div>
          : <div className="muted small">The token is encrypted with your operating system’s secure storage and only ever used by the app’s background process. Local-only repositories never use it.</div>}
      </div>
    </div>
  )
}
