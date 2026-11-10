import type { BlobResult, CommitDetail, CommitSummary, CompareResult, LogOptions, RefInfo, RepoInfo, TreeEntry } from './types'

/** The API exposed to the renderer as `window.api`. Every call stays on the local machine. */
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
}

export const CHANNELS: (keyof RepoApi)[] = [
  'pickRepoFolder', 'openRepo', 'listRefs', 'listTree', 'readBlob', 'getLog', 'countCommits', 'getCommit', 'compareRefs'
]
