import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthStatus, GithubRepo } from '@shared/types'
import { errMsg } from './util'

interface Ctx {
  status: AuthStatus | null
  /** Set when the account state could not be read (e.g. the main process is an older build than the UI). */
  statusError: string | null
  signIn(token: string): Promise<void>
  /** Reuses the login from the GitHub CLI / git credential helper. */
  signInExisting(): Promise<void>
  signOut(): Promise<void>
  /** Repositories the signed-in user can access, fetched lazily; null until loaded. */
  repos: GithubRepo[] | null
  reposLoading: boolean
  reposError: string | null
  loadRepos(force?: boolean): Promise<void>
}
const AuthCtx = createContext<Ctx>(null!)
export const useAuth = (): Ctx => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [repos, setRepos] = useState<GithubRepo[] | null>(null)
  const [reposLoading, setLoading] = useState(false)
  const [reposError, setError] = useState<string | null>(null)

  useEffect(() => {
    // Wrapped so a missing method (stale main process) becomes a visible error instead of a blank page.
    Promise.resolve().then(() => window.api.authStatus()).then(setStatus, (e) => setStatusError(errMsg(e)))
  }, [])

  const signIn = useCallback(async (token: string) => {
    setStatus(await window.api.authSignIn(token))
    setRepos(null)
  }, [])
  const signInExisting = useCallback(async () => {
    setStatus(await window.api.authUseExistingLogin())
    setRepos(null)
  }, [])
  const signOut = useCallback(async () => {
    setStatus(await window.api.authSignOut())
    setRepos(null)
    setError(null)
  }, [])

  const loadRepos = useCallback(async (force = false) => {
    if (!force && repos) return
    setLoading(true)
    setError(null)
    try { setRepos(await window.api.githubListRepos()) } catch (e) { setError(errMsg(e)) } finally { setLoading(false) }
  }, [repos])

  return <AuthCtx.Provider value={{ status, statusError, signIn, signInExisting, signOut, repos, reposLoading, reposError, loadRepos }}>{children}</AuthCtx.Provider>
}
