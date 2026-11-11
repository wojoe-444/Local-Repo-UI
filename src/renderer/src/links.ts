const q = (o: Record<string, string | undefined>): string =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString()

export const treeLink = (ref: string, path: string): string => `/repo/tree?${q({ ref, path })}`
export const blobLink = (ref: string, path: string): string => `/repo/blob?${q({ ref, path })}`
export const commitsLink = (ref: string, path?: string): string => `/repo/commits?${q({ ref, path })}`
export const commitLink = (sha: string): string => `/repo/commit/${sha}`
export const compareLink = (base?: string, head?: string): string => `/repo/compare?${q({ base, head })}`

export const issuesLink = (o: { state?: 'open' | 'closed'; q?: string; labels?: string[]; page?: number } = {}): string => {
  const sp = new URLSearchParams()
  if (o.state === 'closed') sp.set('state', 'closed')
  if (o.q) sp.set('q', o.q)
  for (const l of o.labels ?? []) sp.append('label', l)
  if (o.page && o.page > 1) sp.set('page', String(o.page))
  const qs = sp.toString()
  return `/repo/issues${qs ? `?${qs}` : ''}`
}
export const newIssueLink = (): string => '/repo/issues/new'
export const issueLink = (n: number): string => `/repo/issues/${n}`
