import type {
  Issue, IssueComment, IssueCreateInput, IssueDetail, IssueLabel, IssueList, IssueListOptions, IssueTarget, IssueUpdateInput,
  IssueUser, LabelCreateInput
} from '../shared/types'
import { assertRepoId, type GithubClient } from './github'
import { IssueInputError, type LocalIssues } from './local-issues'

export interface IssueServiceDeps {
  local: LocalIssues
  gh: GithubClient
  /** Throws unless the repo path was explicitly opened by the user. */
  guard: (repo: string) => string
  /** Login of the signed-in GitHub user (null when signed out). */
  viewerLogin: () => Promise<string | null>
  /** Who to credit for local issues and comments. */
  localAuthor: (repo: string) => Promise<IssueUser>
}

type Resolved = { kind: 'local'; repo: string } | { kind: 'github'; owner: string; name: string }

/**
 * Routes issue operations to the local store or to GitHub. This is the only place that decides where an issue
 * operation goes: a `local` target can never reach the GitHub client.
 */
export function createIssueService(d: IssueServiceDeps) {
  function resolve(t: IssueTarget): Resolved {
    if (t?.kind === 'local' && typeof t.repo === 'string') return { kind: 'local', repo: d.guard(t.repo) }
    if (t?.kind === 'github') return { kind: 'github', ...assertRepoId(t.owner, t.name) }
    throw new IssueInputError('Invalid issue target')
  }
  const num = (n: unknown): number => {
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) throw new IssueInputError('Invalid issue number')
    return n
  }

  return {
    async list(t: IssueTarget, o: IssueListOptions): Promise<IssueList> {
      const r = resolve(t)
      if (o?.state !== 'open' && o?.state !== 'closed') throw new IssueInputError('Invalid state')
      const opts: IssueListOptions = { state: o.state, page: typeof o.page === 'number' ? o.page : 1, labels: Array.isArray(o.labels) ? o.labels.filter((l) => typeof l === 'string') : undefined, query: typeof o.query === 'string' ? o.query : undefined }
      return r.kind === 'local' ? d.local.list(r.repo, opts) : d.gh.listIssues(r.owner, r.name, opts)
    },
    async get(t: IssueTarget, n: number): Promise<IssueDetail> {
      const r = resolve(t)
      return r.kind === 'local' ? d.local.get(r.repo, num(n)) : d.gh.getIssue(r.owner, r.name, num(n))
    },
    async create(t: IssueTarget, input: IssueCreateInput): Promise<Issue> {
      const r = resolve(t)
      if (r.kind === 'local') return d.local.create(r.repo, input, await d.localAuthor(r.repo))
      const login = input?.assignSelf ? await d.viewerLogin() : null
      return d.gh.createIssue(r.owner, r.name, input, login ? [login] : [])
    },
    async update(t: IssueTarget, n: number, patch: IssueUpdateInput): Promise<Issue> {
      const r = resolve(t)
      return r.kind === 'local' ? d.local.update(r.repo, num(n), patch, await d.localAuthor(r.repo)) : d.gh.updateIssue(r.owner, r.name, num(n), patch)
    },
    async comment(t: IssueTarget, n: number, body: string): Promise<IssueComment> {
      const r = resolve(t)
      return r.kind === 'local' ? d.local.comment(r.repo, num(n), body, await d.localAuthor(r.repo)) : d.gh.createComment(r.owner, r.name, num(n), body)
    },
    async labels(t: IssueTarget): Promise<IssueLabel[]> {
      const r = resolve(t)
      return r.kind === 'local' ? d.local.labels(r.repo) : d.gh.listLabels(r.owner, r.name)
    },
    async createLabel(t: IssueTarget, input: LabelCreateInput): Promise<IssueLabel> {
      const r = resolve(t)
      return r.kind === 'local' ? d.local.createLabel(r.repo, input) : d.gh.createLabel(r.owner, r.name, input)
    }
  }
}
