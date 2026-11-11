import type {
  GithubRepo, Issue, IssueComment, IssueCreateInput, IssueDetail, IssueLabel, IssueList, IssueListOptions,
  IssueStateReason, IssueUpdateInput, IssueUser, LabelCreateInput, TimelineItem
} from '../shared/types'
import { PAGE_SIZE, checkBody, checkLabelInput, checkLabelList, checkTitle } from './local-issues'

export const GITHUB_API = 'https://api.github.com'
const MAX_REPO_PAGES = 20
const MAX_COMMENT_PAGES = 5
const MAX_LABEL_PAGES = 5

export type GithubErrorCode = 'auth' | 'sso' | 'notfound' | 'rate' | 'gone' | 'forbidden' | 'validation' | 'network' | 'other'
export class GithubError extends Error {
  constructor(message: string, readonly code: GithubErrorCode, readonly status = 0) { super(message) }
}

export interface GithubClientOptions {
  getToken: () => string | null
  fetchImpl: typeof fetch
  baseUrl?: string
}

const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/
/** Owner and repo names come from the renderer and end up in URL paths; accept only what GitHub itself allows. */
export function assertRepoId(owner: unknown, name: unknown): { owner: string; name: string } {
  if (typeof owner !== 'string' || typeof name !== 'string' || !NAME_RE.test(owner) || !NAME_RE.test(name) || name === '.' || name === '..')
    throw new GithubError('Invalid repository name', 'validation')
  return { owner, name }
}

// ---------------------------------------------------------------- response mappers

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const ghost: IssueUser = { login: 'ghost', avatarUrl: null }
export const mapUser = (u: Json | null | undefined): IssueUser => (u?.login ? { login: String(u.login), avatarUrl: u.avatar_url ? String(u.avatar_url) : null } : ghost)
export const mapLabel = (l: Json | string): IssueLabel =>
  typeof l === 'string' ? { name: l, color: 'ededed', description: null } : { name: String(l.name), color: String(l.color || 'ededed'), description: l.description ? String(l.description) : null }

function mapReason(r: unknown): IssueStateReason {
  if (r === 'completed' || r === 'reopened') return r
  if (r === 'not_planned' || r === 'duplicate') return 'not_planned'
  return null
}

export function mapIssue(i: Json): Issue {
  return {
    number: i.number, title: String(i.title ?? ''), body: String(i.body ?? ''), state: i.state === 'closed' ? 'closed' : 'open',
    stateReason: mapReason(i.state_reason), author: mapUser(i.user), labels: (i.labels ?? []).map(mapLabel),
    assignees: (i.assignees ?? []).map(mapUser), comments: i.comments ?? 0, createdAt: i.created_at, updatedAt: i.updated_at,
    closedAt: i.closed_at ?? null, htmlUrl: i.html_url ?? null
  }
}
const mapComment = (c: Json): IssueComment => ({ id: String(c.id), author: mapUser(c.user), body: String(c.body ?? ''), createdAt: c.created_at, updatedAt: c.updated_at })

export function mapRepo(r: Json): GithubRepo {
  return {
    owner: r.owner.login, name: r.name, fullName: r.full_name, description: r.description ?? null, private: !!r.private, fork: !!r.fork,
    archived: !!r.archived, hasIssues: r.has_issues !== false, defaultBranch: r.default_branch ?? 'main', htmlUrl: r.html_url,
    pushedAt: r.pushed_at ?? null, ownerType: r.owner.type === 'Organization' ? 'Organization' : 'User',
    canPush: !!(r.permissions?.push || r.permissions?.admin || r.permissions?.maintain)
  }
}

/** Free text typed in the search box must not be able to redirect the query to another repository or state. */
export function sanitizeSearchText(text: string): string {
  return text.split(/\s+/).filter((t) => t && !/^-?(repo|org|user|owner|is|state|type|in|archived|author|label|no):/i.test(t)).join(' ')
}

// ---------------------------------------------------------------- client

export function createGithubClient(opts: GithubClientOptions) {
  const base = opts.baseUrl ?? GITHUB_API

  async function request(method: string, path: string, o: { query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<{ data: any; headers: Headers }> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const token = opts.getToken()
    if (!token) throw new GithubError('Not signed in to GitHub', 'auth', 401)
    const url = new URL(base + path)
    for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v))
    let res: Response
    try {
      res = await opts.fetchImpl(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'local-repo-ui', ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        // Renamed/transferred repos answer with a redirect; fetch drops the Authorization header on cross-origin hops.
        redirect: 'follow'
      })
    } catch (e) {
      throw new GithubError(`Could not reach GitHub: ${(e as Error).message}`, 'network')
    }
    if (res.ok) return { data: res.status === 204 ? null : await res.json(), headers: res.headers }
    throw await toError(res)
  }

  async function toError(res: Response): Promise<GithubError> {
    const body = (await res.json().catch(() => ({}))) as Json
    const detail = [body.message, ...(Array.isArray(body.errors) ? body.errors.map((e: Json) => e.message ?? e.code) : [])].filter(Boolean).join(': ')
    const s = res.status
    if (s === 401) return new GithubError('GitHub rejected the saved token. It may have expired or been revoked: sign in again.', 'auth', s)
    if (res.headers.get('x-github-sso')) return new GithubError('This organization requires SAML SSO. Open your token on GitHub and authorize it for the organization, then try again.', 'sso', s)
    if ((s === 403 || s === 429) && (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail))) {
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      return new GithubError(`GitHub rate limit reached${reset ? `; resets at ${new Date(reset * 1000).toLocaleTimeString()}` : ''}.`, 'rate', s)
    }
    if (s === 403) return new GithubError(`GitHub refused this action${detail ? `: ${detail}` : ''}. Your token may lack the required scope or repository access.`, 'forbidden', s)
    if (s === 404) return new GithubError('Not found, or this account has no access to it.', 'notfound', s)
    if (s === 410) return new GithubError('Issues are disabled for this repository.', 'gone', s)
    if (s === 422) return new GithubError(`GitHub rejected the request: ${detail || 'validation failed'}`, 'validation', s)
    return new GithubError(`GitHub returned ${s}${detail ? `: ${detail}` : ''}`, 'other', s)
  }

  const nextPage = (h: Headers): boolean => /rel="next"/.test(h.get('link') ?? '')
  const repoPath = (owner: string, name: string): string => {
    const r = assertRepoId(owner, name)
    return `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.name)}`
  }
  async function pages(path: string, query: Record<string, string | number>, max: number): Promise<{ items: Json[]; more: boolean }> {
    const items: Json[] = []
    for (let page = 1; page <= max; page++) {
      const { data, headers } = await request('GET', path, { query: { ...query, per_page: 100, page } })
      items.push(...data)
      if (!nextPage(headers)) return { items, more: false }
    }
    return { items, more: true }
  }

  async function issueCounts(owner: string, name: string, labels: string[]): Promise<{ open: number; closed: number } | null> {
    try {
      const { data } = await request('POST', '/graphql', {
        body: {
          query: 'query($owner:String!,$name:String!,$labels:[String!]){repository(owner:$owner,name:$name){open:issues(states:OPEN,labels:$labels){totalCount} closed:issues(states:CLOSED,labels:$labels){totalCount}}}',
          variables: { owner, name, labels: labels.length ? labels : null }
        }
      })
      const r = data?.data?.repository
      return r ? { open: r.open.totalCount, closed: r.closed.totalCount } : null
    } catch {
      return null
    }
  }

  async function searchIssues(owner: string, name: string, o: IssueListOptions, state: 'open' | 'closed', perPage: number, page: number): Promise<{ items: Json[]; total: number }> {
    const q = [
      `repo:${owner}/${name}`, 'is:issue', `is:${state}`,
      ...(o.labels ?? []).map((l) => `label:"${l.replace(/"/g, '')}"`), sanitizeSearchText(o.query ?? '')
    ].filter(Boolean).join(' ')
    const { data } = await request('GET', '/search/issues', { query: { q, sort: 'created', order: 'desc', per_page: perPage, page } })
    return { items: data.items, total: data.total_count }
  }

  return {
    request,

    async getViewer(): Promise<{ login: string; name: string | null; avatarUrl: string | null }> {
      const { data } = await request('GET', '/user')
      return { login: data.login, name: data.name ?? null, avatarUrl: data.avatar_url ?? null }
    },

    /** Every repository the user can see: their own, ones they collaborate on, and organization repos. */
    async listRepos(): Promise<GithubRepo[]> {
      const { items } = await pages('/user/repos', { affiliation: 'owner,collaborator,organization_member', sort: 'pushed', direction: 'desc' }, MAX_REPO_PAGES)
      return items.map(mapRepo)
    },

    async getRepo(owner: string, name: string): Promise<GithubRepo> {
      return mapRepo((await request('GET', repoPath(owner, name))).data)
    },

    async listIssues(owner: string, name: string, o: IssueListOptions): Promise<IssueList> {
      const rp = repoPath(owner, name)
      const page = Math.max(1, Math.floor(o.page) || 1)
      const labels = checkLabelList(o.labels)
      const query = typeof o.query === 'string' ? sanitizeSearchText(o.query) : ''
      if (query) {
        const other = o.state === 'open' ? 'closed' : 'open'
        const [mine, theirs] = await Promise.all([
          searchIssues(owner, name, { ...o, labels, query }, o.state, PAGE_SIZE, page),
          searchIssues(owner, name, { ...o, labels, query }, other, 1, 1).catch(() => null)
        ])
        const counts = theirs ? { [o.state]: mine.total, [other]: theirs.total } as { open: number; closed: number } : null
        return { issues: mine.items.map(mapIssue), hasNext: page * PAGE_SIZE < Math.min(mine.total, 1000), counts }
      }
      const [res, counts] = await Promise.all([
        request('GET', `${rp}/issues`, { query: { state: o.state, labels: labels.join(',') || undefined, sort: 'created', direction: 'desc', per_page: PAGE_SIZE, page } }),
        issueCounts(owner, name, labels)
      ])
      // The issues endpoint also returns pull requests.
      return { issues: (res.data as Json[]).filter((i) => !i.pull_request).map(mapIssue), hasNext: nextPage(res.headers), counts }
    },

    async getIssue(owner: string, name: string, number: number): Promise<IssueDetail> {
      const rp = repoPath(owner, name)
      const { data } = await request('GET', `${rp}/issues/${number}`)
      if (data.pull_request) throw new GithubError(`#${number} is a pull request, not an issue.`, 'notfound', 404)
      const issue = mapIssue(data)
      const { items, more } = issue.comments ? await pages(`${rp}/issues/${number}/comments`, {}, MAX_COMMENT_PAGES) : { items: [], more: false }
      const timeline: TimelineItem[] = items.map((c) => ({ type: 'comment' as const, ...mapComment(c) }))
      if (issue.state === 'closed' && issue.closedAt) {
        timeline.push({ type: 'event', id: 'closed', event: 'closed', actor: mapUser(data.closed_by), createdAt: issue.closedAt, stateReason: issue.stateReason })
        timeline.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      }
      return { issue, timeline, truncated: more }
    },

    async createIssue(owner: string, name: string, input: IssueCreateInput, assignees: string[] = []): Promise<Issue> {
      const body = { title: checkTitle(input?.title), body: checkBody(input.body) || undefined, labels: checkLabelList(input.labels), assignees }
      return mapIssue((await request('POST', `${repoPath(owner, name)}/issues`, { body })).data)
    },

    async updateIssue(owner: string, name: string, number: number, patch: IssueUpdateInput): Promise<Issue> {
      const body: Json = {}
      if (patch?.title !== undefined) body.title = checkTitle(patch.title)
      if (patch?.body !== undefined) body.body = checkBody(patch.body)
      if (patch?.labels !== undefined) body.labels = checkLabelList(patch.labels)
      if (patch?.state !== undefined) {
        if (patch.state !== 'open' && patch.state !== 'closed') throw new GithubError('Invalid state', 'validation')
        body.state = patch.state
        body.state_reason = patch.state === 'closed' ? (patch.stateReason === 'not_planned' ? 'not_planned' : 'completed') : 'reopened'
      }
      return mapIssue((await request('PATCH', `${repoPath(owner, name)}/issues/${number}`, { body })).data)
    },

    async createComment(owner: string, name: string, number: number, bodyIn: string): Promise<IssueComment> {
      const body = checkBody(bodyIn)
      if (!body.trim()) throw new GithubError('Comment cannot be empty', 'validation')
      return mapComment((await request('POST', `${repoPath(owner, name)}/issues/${number}/comments`, { body: { body } })).data)
    },

    async listLabels(owner: string, name: string): Promise<IssueLabel[]> {
      return (await pages(`${repoPath(owner, name)}/labels`, {}, MAX_LABEL_PAGES)).items.map(mapLabel)
    },

    async createLabel(owner: string, name: string, input: LabelCreateInput): Promise<IssueLabel> {
      const l = checkLabelInput(input)
      return mapLabel((await request('POST', `${repoPath(owner, name)}/labels`, { body: { name: l.name, color: l.color, description: l.description ?? undefined } })).data)
    }
  }
}
export type GithubClient = ReturnType<typeof createGithubClient>

/** Fetches an avatar for display. Only GitHub's avatar host is allowed, so this cannot be turned into a general proxy. */
export async function fetchAvatar(fetchImpl: typeof fetch, url: string): Promise<string | null> {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:' || u.hostname !== 'avatars.githubusercontent.com') return null
  u.searchParams.set('s', '64')
  try {
    const res = await fetchImpl(u.toString(), { redirect: 'error' })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/^image\/(png|jpeg|gif|webp)/.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 256 * 1024) return null
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
