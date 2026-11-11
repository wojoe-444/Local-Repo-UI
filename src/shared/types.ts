export interface RepoInfo {
  path: string
  name: string
  /** Currently checked-out branch, or null when HEAD is detached / repo is empty. */
  currentBranch: string | null
  headSha: string | null
  isEmpty: boolean
  /** Branch shown by default: current branch, else main/master, else first branch. */
  defaultRef: string | null
  /** The github.com repository this checkout's remotes point at (parsed from config, no network). */
  githubRemote: GithubRemote | null
}

export interface GithubRemote {
  owner: string
  name: string
  /** Which git remote it was found on, e.g. "origin". */
  remote: string
}

export interface RefInfo {
  name: string
  type: 'branch' | 'tag'
  sha: string
  isCurrent: boolean
  date: string
  author: string
  subject: string
  /** Commits ahead/behind the repo's default branch (branches only). */
  ahead?: number
  behind?: number
}

export interface TreeEntry {
  name: string
  path: string
  type: 'dir' | 'file' | 'submodule' | 'symlink'
  size: number | null
  lastCommit?: { sha: string; subject: string; date: string }
}

export interface CommitSummary {
  sha: string
  shortSha: string
  parents: string[]
  authorName: string
  authorEmail: string
  date: string
  subject: string
  body: string
  refs: string[]
}

export type BlobResult =
  | { kind: 'text'; content: string; size: number; truncated: boolean }
  | { kind: 'image'; dataUrl: string; size: number }
  | { kind: 'binary'; size: number }
  | { kind: 'toolarge'; size: number }

export interface DiffLine {
  type: 'context' | 'add' | 'del' | 'meta'
  content: string
  oldNo: number | null
  newNo: number | null
}
export interface DiffHunk {
  header: string
  lines: DiffLine[]
}
export interface DiffFile {
  oldPath: string
  newPath: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  binary: boolean
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

export interface CommitDetail extends CommitSummary {
  files: DiffFile[]
  truncated: boolean
}

export interface CompareResult {
  base: string
  head: string
  commits: CommitSummary[]
  files: DiffFile[]
  truncated: boolean
}

export interface LogOptions {
  ref: string
  path?: string
  skip?: number
  limit?: number
  search?: string
}

// ---------------------------------------------------------------- GitHub account

export interface AuthStatus {
  signedIn: boolean
  login: string | null
  name: string | null
  /** A data: URL (fetched at sign-in), never a remote URL. */
  avatarUrl: string | null
  /** False when the OS cannot encrypt secrets: the token is then held in memory for this session only. */
  canPersist: boolean
}

export interface GithubRepo {
  owner: string
  name: string
  fullName: string
  description: string | null
  private: boolean
  fork: boolean
  archived: boolean
  hasIssues: boolean
  defaultBranch: string
  htmlUrl: string
  pushedAt: string | null
  ownerType: 'User' | 'Organization'
  /** Whether the signed-in user may push, i.e. is more than a reader. */
  canPush: boolean
  /** Local clone registered for this repository, if any. */
  clonePath?: string | null
}

// ---------------------------------------------------------------- Issues

/** Where an issue operation goes: a purely local store, or the live GitHub API. */
export type IssueTarget =
  | { kind: 'local'; repo: string }
  | { kind: 'github'; owner: string; name: string }

export interface IssueUser {
  login: string
  avatarUrl: string | null
}

export interface IssueLabel {
  name: string
  /** Six hex digits, no leading '#'. */
  color: string
  description: string | null
}

export type IssueState = 'open' | 'closed'
export type IssueStateReason = 'completed' | 'not_planned' | 'reopened' | null

export interface Issue {
  number: number
  title: string
  body: string
  state: IssueState
  stateReason: IssueStateReason
  author: IssueUser
  labels: IssueLabel[]
  assignees: IssueUser[]
  comments: number
  createdAt: string
  updatedAt: string
  closedAt: string | null
  htmlUrl: string | null
}

export interface IssueComment {
  id: string
  author: IssueUser
  body: string
  createdAt: string
  updatedAt: string
}

export type TimelineItem =
  | ({ type: 'comment' } & IssueComment)
  | { type: 'event'; id: string; event: 'closed' | 'reopened'; actor: IssueUser; createdAt: string; stateReason: IssueStateReason }

export interface IssueDetail {
  issue: Issue
  timeline: TimelineItem[]
  /** True when the issue has more comments than were loaded. */
  truncated: boolean
}

export interface IssueListOptions {
  state: IssueState
  labels?: string[]
  query?: string
  /** 1-based. */
  page: number
}

export interface IssueList {
  issues: Issue[]
  hasNext: boolean
  /** Null when the counts could not be determined. */
  counts: { open: number; closed: number } | null
}

export interface IssueCreateInput {
  title: string
  body?: string
  labels?: string[]
  /** GitHub only: assign the issue to the signed-in user. */
  assignSelf?: boolean
}

export interface IssueUpdateInput {
  title?: string
  body?: string
  state?: IssueState
  stateReason?: 'completed' | 'not_planned' | 'reopened'
  /** Replaces the full label set. */
  labels?: string[]
}

export interface LabelCreateInput {
  name: string
  color: string
  description?: string
}
