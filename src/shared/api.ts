import type {
  AuthStatus, BlobResult, CommitDetail, CommitSummary, CompareResult, GithubRepo, Issue, IssueComment, IssueCreateInput,
  IssueDetail, IssueLabel, IssueList, IssueListOptions, IssueTarget, IssueUpdateInput, LabelCreateInput, LogOptions,
  RefInfo, RepoInfo, TreeEntry, UpdateState
} from './types'

/**
 * The API exposed to the renderer as `window.api`.
 *
 * Calls fall in two groups: local ones (git, local issues) never touch the network. Only the `auth*`, `github*` and
 * `issues*`/`labels*` calls with a `{ kind: 'github' }` target go to api.github.com, and only from the main process.
 */
export interface RepoApi {
  pickRepoFolder(): Promise<string | null>
  openRepo(dir: string): Promise<RepoInfo>
  listRefs(repo: string): Promise<RefInfo[]>
  listTree(repo: string, ref: string, path: string): Promise<TreeEntry[]>
  readBlob(repo: string, ref: string, path: string): Promise<BlobResult>
  getLog(repo: string, opts: LogOptions): Promise<{ commits: CommitSummary[]; hasMore: boolean }>
  countCommits(repo: string, ref: string): Promise<number>
  getCommit(repo: string, sha: string): Promise<CommitDetail>
  compareRefs(repo: string, base: string, head: string): Promise<CompareResult>

  /** Opens an https URL in the user's default browser. */
  openExternal(url: string): Promise<void>

  // GitHub account (token lives in the main process only, encrypted with the OS keychain when available)
  authStatus(): Promise<AuthStatus>
  authSignIn(token: string): Promise<AuthStatus>
  authSignOut(): Promise<AuthStatus>
  githubListRepos(): Promise<GithubRepo[]>
  githubGetRepo(owner: string, name: string): Promise<GithubRepo>
  /** Avatar image fetched by the main process, as a data URL (the renderer's CSP blocks remote images). */
  githubAvatar(url: string): Promise<string | null>

  // Linking GitHub repositories to local clones, and per-repo preferences
  getClonePath(owner: string, name: string): Promise<string | null>
  linkClone(owner: string, name: string): Promise<RepoInfo | null>
  getRepoPrefs(repo: string): Promise<{ localOnly: boolean }>
  setRepoLocalOnly(repo: string, localOnly: boolean): Promise<void>

  // Issues: the same calls serve local-only and live GitHub repos, depending on the target.
  issuesList(target: IssueTarget, opts: IssueListOptions): Promise<IssueList>
  issuesGet(target: IssueTarget, number: number): Promise<IssueDetail>
  issuesCreate(target: IssueTarget, input: IssueCreateInput): Promise<Issue>
  issuesUpdate(target: IssueTarget, number: number, patch: IssueUpdateInput): Promise<Issue>
  issuesComment(target: IssueTarget, number: number, body: string): Promise<IssueComment>
  labelsList(target: IssueTarget): Promise<IssueLabel[]>
  labelsCreate(target: IssueTarget, input: LabelCreateInput): Promise<IssueLabel>

  // App updates (GitHub Releases of this app). Network is only used when the user asks: check, then download.
  updateGetState(): Promise<UpdateState>
  updateCheck(): Promise<UpdateState>
  updateDownload(): Promise<UpdateState>
  /** Quits, installs the downloaded update and relaunches. */
  updateInstall(): Promise<void>
}

/** Push events from the main process, exposed next to the invoke-style calls. */
export interface RepoEvents {
  /** Subscribes to updater state changes; returns an unsubscribe function. */
  onUpdateState(cb: (s: UpdateState) => void): () => void
}

export const UPDATE_STATE_EVENT = 'update-state'

export const CHANNELS = [
  'pickRepoFolder', 'openRepo', 'listRefs', 'listTree', 'readBlob', 'getLog', 'countCommits', 'getCommit', 'compareRefs',
  'openExternal', 'authStatus', 'authSignIn', 'authSignOut', 'githubListRepos', 'githubGetRepo', 'githubAvatar',
  'getClonePath', 'linkClone', 'getRepoPrefs', 'setRepoLocalOnly',
  'issuesList', 'issuesGet', 'issuesCreate', 'issuesUpdate', 'issuesComment', 'labelsList', 'labelsCreate',
  'updateGetState', 'updateCheck', 'updateDownload', 'updateInstall'
] as const

// Compile-time check that every RepoApi method has a channel.
type Missing = Exclude<keyof RepoApi, (typeof CHANNELS)[number]>
export const channelsComplete: Missing extends never ? true : never = true
