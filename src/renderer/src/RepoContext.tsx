import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { GithubRepo, IssueTarget, RefInfo, RepoInfo } from '@shared/types'
import { errMsg } from './util'

const RECENTS_KEY = 'lru.recents'
export const loadRecents = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') } catch { return [] }
}
const saveRecents = (p: string): void =>
  localStorage.setItem(RECENTS_KEY, JSON.stringify([p, ...loadRecents().filter((x) => x !== p)].slice(0, 12)))

/** The github.com repository the open repo is linked to (it may or may not have a local checkout). */
export interface RemoteRepo { owner: string; name: string; info: GithubRepo | null }

interface Ctx {
  /** The local checkout. Null while viewing a GitHub repository that has no linked clone. */
  repo: RepoInfo | null
  refs: RefInfo[]
  remote: RemoteRepo | null
  /** The user chose to keep this repo's issues local although it has a github.com remote. */
  localOnly: boolean
  /** Where issue operations go; null when nothing is open. */
  issueTarget: IssueTarget | null
  open(dir: string): Promise<void>
  /** Opens a repository from the GitHub list: its local clone if one is registered, otherwise GitHub only. */
  openGithub(r: GithubRepo): Promise<void>
  /** Asks for the local clone of the open GitHub repo. */
  linkClone(): Promise<void>
  pick(): Promise<void>
  refresh(): Promise<void>
  close(): void
  setLocalOnly(on: boolean): Promise<void>
  error: string | null
}
const RepoCtx = createContext<Ctx>(null!)
export const useRepo = (): Ctx => useContext(RepoCtx)

export function RepoProvider({ children }: { children: ReactNode }): JSX.Element {
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [refs, setRefs] = useState<RefInfo[]>([])
  const [remote, setRemote] = useState<RemoteRepo | null>(null)
  const [localOnly, setLocalOnlyState] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = useCallback(async (dir: string) => {
    try {
      const info = await window.api.openRepo(dir)
      const [refList, prefs] = await Promise.all([window.api.listRefs(info.path), window.api.getRepoPrefs(info.path)])
      setRefs(refList)
      setRepo(info)
      setRemote(info.githubRemote ? { owner: info.githubRemote.owner, name: info.githubRemote.name, info: null } : null)
      setLocalOnlyState(prefs.localOnly)
      setError(null)
      saveRecents(info.path)
    } catch (e) {
      setError(errMsg(e))
      throw e
    }
  }, [])

  const openGithub = useCallback(async (r: GithubRepo) => {
    setError(null)
    if (r.clonePath) {
      try {
        await open(r.clonePath)
        setRemote({ owner: r.owner, name: r.name, info: r })
        return
      } catch { /* clone moved or deleted: fall back to GitHub-only */ }
    }
    setRepo(null)
    setRefs([])
    setRemote({ owner: r.owner, name: r.name, info: r })
    setLocalOnlyState(false)
  }, [open])

  const linkClone = useCallback(async () => {
    if (!remote) return
    try {
      const info = await window.api.linkClone(remote.owner, remote.name)
      if (info) await open(info.path)
      setError(null)
    } catch (e) { setError(errMsg(e)) }
  }, [remote, open])

  const setLocalOnly = useCallback(async (on: boolean) => {
    if (!repo) return
    await window.api.setRepoLocalOnly(repo.path, on)
    setLocalOnlyState(on)
  }, [repo])

  const pick = useCallback(async () => {
    const dir = await window.api.pickRepoFolder()
    if (dir) await open(dir).catch(() => undefined)
  }, [open])

  const refresh = useCallback(async () => { if (repo) await open(repo.path) }, [repo, open])

  // Restore the last repo after a reload.
  useEffect(() => { const [last] = loadRecents(); if (last) open(last).catch(() => undefined) }, [open])

  const issueTarget: IssueTarget | null =
    remote && !(repo && localOnly) ? { kind: 'github', owner: remote.owner, name: remote.name } : repo ? { kind: 'local', repo: repo.path } : null

  const close = useCallback(() => { setRepo(null); setRemote(null) }, [])

  return (
    <RepoCtx.Provider value={{ repo, refs, remote, localOnly, issueTarget, open, openGithub, linkClone, pick, refresh, close, setLocalOnly, error }}>
      {children}
    </RepoCtx.Provider>
  )
}

/** Small async-data hook with loading and error state. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean } {
  const [state, set] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  useEffect(() => {
    let live = true
    set((s) => ({ ...s, loading: true, error: null }))
    fn().then(
      (data) => live && set({ data, error: null, loading: false }),
      (e: Error) => live && set({ data: null, error: errMsg(e), loading: false })
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
