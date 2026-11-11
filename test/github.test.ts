import { describe, it, expect, vi } from 'vitest'
import { createGithubClient, fetchAvatar, GithubError, mapIssue, sanitizeSearchText, assertRepoId } from '../src/main/github'
import { createIssueService } from '../src/main/issue-service'
import { createLocalIssues } from '../src/main/local-issues'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string> }
function mock(handler: Handler) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input)
    calls.push({ url, init })
    const r = handler(url, init)
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json', ...r.headers } })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}
const user = { login: 'octo', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' }
const rawIssue = (n: number, extra: object = {}) => ({
  number: n, title: `Issue ${n}`, body: 'b', state: 'open', state_reason: null, user, labels: [{ name: 'bug', color: 'd73a4a', description: null }],
  assignees: [], comments: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', closed_at: null, html_url: `https://github.com/o/r/issues/${n}`, ...extra
})
const client = (handler: Handler, token: string | null = 'tok123') => {
  const m = mock(handler)
  return { ...m, gh: createGithubClient({ getToken: () => token, fetchImpl: m.fetchImpl }) }
}

describe('github client', () => {
  it('sends the token and API headers, only to api.github.com', async () => {
    const { gh, calls } = client(() => ({ body: { login: 'octo', name: 'Octo', avatar_url: null } }))
    await gh.getViewer()
    expect(calls[0].url.origin).toBe('https://api.github.com')
    const h = calls[0].init.headers as Record<string, string>
    expect(h.Authorization).toBe('Bearer tok123')
    expect(h['X-GitHub-Api-Version']).toBeTruthy()
  })

  it('refuses to make requests when signed out', async () => {
    const { gh, calls } = client(() => ({}), null)
    await expect(gh.listRepos()).rejects.toMatchObject({ code: 'auth' })
    expect(calls).toHaveLength(0)
  })

  it('lists all repos across pages, including org repos the user does not own', async () => {
    const repo = (full: string, push = false) => ({ full_name: full, name: full.split('/')[1], owner: { login: full.split('/')[0], type: full.startsWith('acme') ? 'Organization' : 'User' }, private: true, html_url: `https://github.com/${full}`, permissions: { push } })
    const { gh, calls } = client((u) => u.searchParams.get('page') === '1'
      ? { body: [repo('me/mine', true)], headers: { link: '<https://api.github.com/user/repos?page=2>; rel="next"' } }
      : { body: [repo('acme/shared'), repo('friend/collab')] })
    const repos = await gh.listRepos()
    expect(repos.map((r) => r.fullName)).toEqual(['me/mine', 'acme/shared', 'friend/collab'])
    expect(repos[1]).toMatchObject({ ownerType: 'Organization', canPush: false, private: true })
    expect(calls[0].url.searchParams.get('affiliation')).toBe('owner,collaborator,organization_member')
  })

  it('lists issues without pull requests and fetches counts', async () => {
    const { gh, calls } = client((u) => {
      if (u.pathname === '/graphql') return { body: { data: { repository: { open: { totalCount: 3 }, closed: { totalCount: 7 } } } } }
      return { body: [rawIssue(1), rawIssue(2, { pull_request: {} }), rawIssue(3)], headers: { link: '<x>; rel="next"' } }
    })
    const r = await gh.listIssues('o', 'r', { state: 'open', labels: ['bug', 'help wanted'], page: 2 })
    expect(r.issues.map((i) => i.number)).toEqual([1, 3])
    expect(r.hasNext).toBe(true)
    expect(r.counts).toEqual({ open: 3, closed: 7 })
    const rest = calls.find((c) => c.url.pathname === '/repos/o/r/issues')!
    expect(rest.url.searchParams.get('labels')).toBe('bug,help wanted')
    expect(rest.url.searchParams.get('page')).toBe('2')
  })

  it('searches with a scoped, sanitised query', async () => {
    expect(sanitizeSearchText('crash repo:other/secret is:closed -label:x   login')).toBe('crash login')
    const { gh, calls } = client((u) => ({ body: { total_count: u.searchParams.get('q')!.includes('is:open') ? 40 : 5, items: [rawIssue(9)] } }))
    const r = await gh.listIssues('o', 'r', { state: 'open', query: 'crash repo:evil/x', page: 1 })
    const q = calls.map((c) => c.url.searchParams.get('q')!)
    expect(q.every((s) => s.startsWith('repo:o/r is:issue'))).toBe(true)
    expect(q.some((s) => s.includes('evil'))).toBe(false)
    expect(r.counts).toEqual({ open: 40, closed: 5 })
    expect(r.hasNext).toBe(true)
  })

  it('creates a real issue with the right payload (and self-assignment)', async () => {
    const { gh, calls } = client(() => ({ status: 201, body: rawIssue(42, { title: 'New thing' }) }))
    const i = await gh.createIssue('o', 'r', { title: ' New thing ', body: 'details', labels: ['bug'] }, ['octo'])
    expect(i.number).toBe(42)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url.pathname).toBe('/repos/o/r/issues')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ title: 'New thing', body: 'details', labels: ['bug'], assignees: ['octo'] })
  })

  it('closes with a reason, reopens, and comments', async () => {
    const { gh, calls } = client((u) => (u.pathname.endsWith('/comments') ? { status: 201, body: { id: 5, user, body: 'hi', created_at: 'a', updated_at: 'a' } } : { body: rawIssue(1, { state: 'closed' }) }))
    await gh.updateIssue('o', 'r', 1, { state: 'closed', stateReason: 'not_planned' })
    await gh.updateIssue('o', 'r', 1, { state: 'open' })
    const c = await gh.createComment('o', 'r', 1, 'hi')
    expect(c.id).toBe('5')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ state: 'closed', state_reason: 'not_planned' })
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ state: 'open', state_reason: 'reopened' })
    expect(calls[0].init.method).toBe('PATCH')
  })

  it('builds the issue timeline from comments plus the closing event', async () => {
    const { gh } = client((u) => u.pathname.endsWith('/comments')
      ? { body: [{ id: 1, user, body: 'c1', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' }] }
      : { body: rawIssue(7, { state: 'closed', state_reason: 'completed', closed_at: '2026-01-03T00:00:00Z', closed_by: user, comments: 1 }) })
    const d = await gh.getIssue('o', 'r', 7)
    expect(d.timeline.map((t) => t.type)).toEqual(['comment', 'event'])
    expect(d.issue.stateReason).toBe('completed')
  })

  it('rejects pull requests fetched as issues', async () => {
    const { gh } = client(() => ({ body: rawIssue(3, { pull_request: {} }) }))
    await expect(gh.getIssue('o', 'r', 3)).rejects.toMatchObject({ code: 'notfound' })
  })

  it('maps errors to useful messages', async () => {
    const run = (status: number, headers: Record<string, string> = {}, body: object = { message: 'm' }) =>
      client(() => ({ status, body, headers })).gh.getRepo('o', 'r').catch((e: GithubError) => e)
    expect(await run(401)).toMatchObject({ code: 'auth' })
    expect(await run(403, { 'x-github-sso': 'required; url=https://github.com/orgs/x/sso' })).toMatchObject({ code: 'sso' })
    expect(await run(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' })).toMatchObject({ code: 'rate' })
    expect(await run(403, {}, { message: 'Resource not accessible by personal access token' })).toMatchObject({ code: 'forbidden' })
    expect(await run(404)).toMatchObject({ code: 'notfound' })
    expect(await run(410)).toMatchObject({ code: 'gone' })
    expect(await run(422, {}, { message: 'Validation Failed', errors: [{ message: 'title is too long' }] })).toMatchObject({ code: 'validation', message: expect.stringContaining('title is too long') })
    const net = createGithubClient({ getToken: () => 't', fetchImpl: (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch })
    await expect(net.getRepo('o', 'r')).rejects.toMatchObject({ code: 'network' })
  })

  it('validates repo identifiers before building URLs', async () => {
    expect(() => assertRepoId('o', '../../user')).toThrow()
    expect(() => assertRepoId('o/x', 'r')).toThrow()
    expect(() => assertRepoId('o', '..')).toThrow()
    expect(assertRepoId('my-org', 'repo.name_1')).toEqual({ owner: 'my-org', name: 'repo.name_1' })
  })

  it('maps issue json defensively', () => {
    const i = mapIssue({ ...rawIssue(1), user: null, labels: ['legacy'], body: null, state_reason: 'duplicate' })
    expect(i.author.login).toBe('ghost'); expect(i.labels[0].name).toBe('legacy'); expect(i.body).toBe(''); expect(i.stateReason).toBe('not_planned')
  })
})

describe('avatars', () => {
  it('only fetches from GitHub’s avatar host and returns a data URL', async () => {
    const f = vi.fn(async () => new Response(Buffer.from([1, 2, 3]), { headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch
    expect(await fetchAvatar(f, 'https://evil.example/a.png')).toBeNull()
    expect(await fetchAvatar(f, 'http://avatars.githubusercontent.com/u/1')).toBeNull()
    expect(f).not.toHaveBeenCalled()
    expect(await fetchAvatar(f, 'https://avatars.githubusercontent.com/u/1?v=4')).toBe('data:image/png;base64,AQID')
  })
})

describe('issue service: local repos stay offline', () => {
  const setup = () => {
    const m = mock(() => ({ body: {} }))
    const dir = mkdtempSync(join(tmpdir(), 'lru-svc-'))
    const svc = createIssueService({
      local: createLocalIssues(dir),
      gh: createGithubClient({ getToken: () => 'tok', fetchImpl: m.fetchImpl }),
      guard: (r) => { if (r !== '/opened') throw new Error('Repository has not been opened'); return r },
      viewerLogin: async () => 'octo',
      localAuthor: async () => ({ login: 'me', avatarUrl: null })
    })
    return { svc, calls: m.calls }
  }

  it('never calls GitHub for a local target, even with a token present', async () => {
    const { svc, calls } = setup()
    const t = { kind: 'local', repo: '/opened' } as const
    await svc.create(t, { title: 'secret thing', body: 'sensitive', assignSelf: true })
    await svc.comment(t, 1, 'more')
    await svc.update(t, 1, { state: 'closed' })
    await svc.list(t, { state: 'closed', query: 'secret', page: 1 })
    await svc.get(t, 1)
    await svc.labels(t)
    await svc.createLabel(t, { name: 'x', color: '000000' })
    expect(calls).toHaveLength(0)
  })

  it('rejects local targets for repos that were not opened, and bad targets', async () => {
    const { svc } = setup()
    await expect(svc.list({ kind: 'local', repo: '/etc' }, { state: 'open', page: 1 })).rejects.toThrow(/not been opened/)
    await expect(svc.list({ kind: 'nope' } as never, { state: 'open', page: 1 })).rejects.toThrow(/Invalid issue target/)
    await expect(svc.get({ kind: 'local', repo: '/opened' }, -1)).rejects.toThrow(/Invalid issue number/)
  })

  it('sends github targets to the API, assigning the signed-in user on request', async () => {
    const m = mock(() => ({ status: 201, body: rawIssue(5) }))
    const svc = createIssueService({
      local: createLocalIssues(mkdtempSync(join(tmpdir(), 'lru-svc-'))), gh: createGithubClient({ getToken: () => 'tok', fetchImpl: m.fetchImpl }),
      guard: (r) => r, viewerLogin: async () => 'octo', localAuthor: async () => ({ login: 'x', avatarUrl: null })
    })
    await svc.create({ kind: 'github', owner: 'acme', name: 'app' }, { title: 'Live', assignSelf: true })
    expect(m.calls[0].url.pathname).toBe('/repos/acme/app/issues')
    expect(JSON.parse(m.calls[0].init.body as string).assignees).toEqual(['octo'])
  })
})
