import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { RefInfo, RepoInfo } from '@shared/types'

const RECENTS_KEY = 'lru.recents'
export const loadRecents = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') } catch { return [] }
}
const saveRecents = (p: string): void =>
  localStorage.setItem(RECENTS_KEY, JSON.stringify([p, ...loadRecents().filter((x) => x !== p)].slice(0, 12)))

interface Ctx {
  repo: RepoInfo | null
  refs: RefInfo[]
  open(dir: string): Promise<void>
  pick(): Promise<void>
  refresh(): Promise<void>
  close(): void
  error: string | null
}
const RepoCtx = createContext<Ctx>(null!)
export const useRepo = (): Ctx => useContext(RepoCtx)

export function RepoProvider({ children }: { children: ReactNode }): JSX.Element {
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [refs, setRefs] = useState<RefInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  const open = useCallback(async (dir: string) => {
    try {
      const info = await window.api.openRepo(dir)
      setRefs(await window.api.listRefs(info.path))
      setRepo(info)
      setError(null)
      saveRecents(info.path)
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '\w+': Error: /, ''))
      throw e
    }
  }, [])

  const pick = useCallback(async () => {
    const dir = await window.api.pickRepoFolder()
    if (dir) await open(dir).catch(() => undefined)
  }, [open])

  const refresh = useCallback(async () => { if (repo) await open(repo.path) }, [repo, open])

  // Restore the last repo after a reload.
  useEffect(() => { const [last] = loadRecents(); if (last) open(last).catch(() => undefined) }, [open])

  return <RepoCtx.Provider value={{ repo, refs, open, pick, refresh, close: () => setRepo(null), error }}>{children}</RepoCtx.Provider>
}

/** Small async-data hook with loading and error state. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean } {
  const [state, set] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  useEffect(() => {
    let live = true
    set((s) => ({ ...s, loading: true, error: null }))
    fn().then(
      (data) => live && set({ data, error: null, loading: false }),
      (e: Error) => live && set({ data: null, error: e.message.replace(/^Error invoking remote method '\w+': Error: /, ''), loading: false })
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
