import { execFile } from 'child_process'
import { basename } from 'path'
import type {
  BlobResult, CommitDetail, CommitSummary, CompareResult, LogOptions,
  RefInfo, RepoInfo, TreeEntry
} from '../shared/types'
import { parseDiff } from './diff'

const MAX_BUFFER = 64 * 1024 * 1024
const MAX_TEXT_BYTES = 1024 * 1024
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_DIFF_FILES = 300
const MAX_DIFF_LINES_PER_FILE = 5000

function run(cwd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-c', 'core.quotepath=false', '-c', 'color.ui=false', '-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', ...args],
      { cwd, encoding: 'buffer', maxBuffer: MAX_BUFFER, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.toString('utf8').trim() || err.message
          reject(new Error(msg))
        } else resolve(stdout)
      }
    )
  })
}

const text = async (cwd: string, args: string[]): Promise<string> => (await run(cwd, args)).toString('utf8')

/** Refs/revisions come from the UI; never allow them to be parsed as git options. */
export function assertRef(ref: string): string {
  if (typeof ref !== 'string' || !ref || ref.startsWith('-') || /[\0\r\n]/.test(ref)) throw new Error(`Invalid ref: ${ref}`)
  return ref
}

/** Paths are used inside `ref:path` or after `--`; just reject traversal and NULs. */
export function assertPath(p: string): string {
  if (typeof p !== 'string') throw new Error('Invalid path')
  const clean = p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (clean.includes('\0') || clean.split('/').some((seg) => seg === '..')) throw new Error(`Invalid path: ${p}`)
  return clean
}

export async function openRepo(dir: string): Promise<RepoInfo> {
  let root: string
  try {
    root = (await text(dir, ['rev-parse', '--show-toplevel'])).trim()
  } catch {
    throw new Error(`"${dir}" is not inside a git repository`)
  }
  // On Windows git prints forward slashes; keep what git gives us for stable identity.
  const headSha = await text(root, ['rev-parse', '--verify', '-q', 'HEAD']).then((s) => s.trim(), () => null)
  const currentBranch = await text(root, ['symbolic-ref', '--short', '-q', 'HEAD']).then((s) => s.trim() || null, () => null)
  const branches = (await text(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])).split('\n').filter(Boolean)
  let defaultRef: string | null = currentBranch
  if (!defaultRef) defaultRef = ['main', 'master'].find((b) => branches.includes(b)) ?? branches[0] ?? (headSha ? 'HEAD' : null)
  return { path: root, name: basename(root), currentBranch, headSha, isEmpty: !headSha && branches.length === 0, defaultRef }
}

export async function listRefs(repo: string): Promise<RefInfo[]> {
  const SEP = '\x1f'
  const fmt = ['%(refname)', '%(objectname)', '%(*objectname)', '%(creatordate:iso-strict)', '%(authorname)', '%(taggername)', '%(contents:subject)', '%(HEAD)'].join(SEP)
  const out = await text(repo, ['for-each-ref', `--format=${fmt}`, '--sort=-creatordate', 'refs/heads', 'refs/tags'])
  const refs: RefInfo[] = out.split('\n').filter(Boolean).map((line) => {
    const [full, sha, peeled, date, author, tagger, subject, head] = line.split(SEP)
    const isTag = full.startsWith('refs/tags/')
    return {
      name: full.replace(/^refs\/(heads|tags)\//, ''),
      type: isTag ? 'tag' : 'branch',
      sha: peeled || sha,
      isCurrent: head === '*',
      date, author: author || tagger, subject
    } satisfies RefInfo
  })
  const info = await openRepo(repo)
  const base = info.defaultRef
  if (base) {
    await Promise.all(refs.filter((r) => r.type === 'branch').slice(0, 200).map(async (r) => {
      try {
        const [behind, ahead] = (await text(repo, ['rev-list', '--left-right', '--count', `${assertRef(base)}...refs/heads/${r.name}`])).trim().split(/\s+/).map(Number)
        r.ahead = ahead
        r.behind = behind
      } catch { /* ignore */ }
    }))
  }
  return refs
}

export async function listTree(repo: string, ref: string, dirPath: string, withLastCommit = true): Promise<TreeEntry[]> {
  assertRef(ref)
  const dir = assertPath(dirPath)
  const args = ['ls-tree', '-z', '-l', ref, '--']
  if (dir) args.push(dir + '/')
  const out = (await run(repo, args)).toString('utf8')
  const entries: TreeEntry[] = out.split('\0').filter(Boolean).map((rec) => {
    const [meta, full] = rec.split('\t')
    const [mode, objType, , size] = meta.trim().split(/\s+/)
    const type: TreeEntry['type'] = objType === 'tree' ? 'dir' : mode === '160000' ? 'submodule' : mode === '120000' ? 'symlink' : 'file'
    return { name: full.slice(dir ? dir.length + 1 : 0), path: full, type, size: size === '-' ? null : Number(size) }
  })
  entries.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  if (withLastCommit) {
    const queue = entries.slice(0, 150)
    const worker = async (): Promise<void> => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        try {
          const o = await text(repo, ['log', '-1', '--format=%H%x1f%s%x1f%aI', ref, '--', e.path])
          const [sha, subject, date] = o.trim().split('\x1f')
          if (sha) e.lastCommit = { sha, subject, date }
        } catch { /* ignore */ }
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker))
  }
  return entries
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml'
}

export async function readBlob(repo: string, ref: string, filePath: string): Promise<BlobResult> {
  assertRef(ref)
  const p = assertPath(filePath)
  const spec = `${ref}:${p}`
  const size = Number((await text(repo, ['cat-file', '-s', spec])).trim())
  const ext = p.split('.').pop()?.toLowerCase() ?? ''
  const mime = IMAGE_MIME[ext]
  if (mime) {
    if (size > MAX_IMAGE_BYTES) return { kind: 'toolarge', size }
    const buf = await run(repo, ['cat-file', 'blob', spec])
    return { kind: 'image', dataUrl: `data:${mime};base64,${buf.toString('base64')}`, size }
  }
  if (size > MAX_TEXT_BYTES * 5) return { kind: 'toolarge', size }
  const buf = await run(repo, ['cat-file', 'blob', spec])
  if (buf.subarray(0, 8000).includes(0)) return { kind: 'binary', size }
  const truncated = buf.length > MAX_TEXT_BYTES
  return { kind: 'text', content: buf.subarray(0, MAX_TEXT_BYTES).toString('utf8'), size, truncated }
}

const LOG_FMT = '%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s%x1f%b%x1e'

function parseLog(out: string): CommitSummary[] {
  return out.split('\x1e').map((r) => r.replace(/^\n/, '')).filter((r) => r.trim()).map((r) => {
    const [sha, parents, authorName, authorEmail, date, refs, subject, body] = r.split('\x1f')
    return {
      sha, shortSha: sha.slice(0, 7), parents: parents ? parents.split(' ') : [],
      authorName, authorEmail, date, subject, body: (body ?? '').trim(),
      refs: refs ? refs.split(', ').filter(Boolean) : []
    }
  })
}

export async function getLog(repo: string, o: LogOptions): Promise<{ commits: CommitSummary[]; hasMore: boolean }> {
  assertRef(o.ref)
  const limit = Math.min(Math.max(Math.trunc(Number(o.limit ?? 30)) || 30, 1), 200)
  const skip = Math.max(Math.trunc(Number(o.skip ?? 0)) || 0, 0)
  const args = ['log', `--format=${LOG_FMT}`, `--skip=${skip}`, `-n`, String(limit + 1)]
  if (o.search && typeof o.search === 'string') args.push('-i', '--fixed-strings', `--grep=${o.search}`)
  args.push(o.ref, '--')
  if (o.path) args.push(assertPath(o.path))
  const commits = parseLog(await text(repo, args))
  return { commits: commits.slice(0, limit), hasMore: commits.length > limit }
}

export async function countCommits(repo: string, ref: string): Promise<number> {
  assertRef(ref)
  return Number((await text(repo, ['rev-list', '--count', ref, '--'])).trim())
}

function limitDiff(files: ReturnType<typeof parseDiff>): { files: ReturnType<typeof parseDiff>; truncated: boolean } {
  let truncated = files.length > MAX_DIFF_FILES
  const kept = files.slice(0, MAX_DIFF_FILES)
  for (const f of kept) {
    let n = 0
    f.hunks = f.hunks.filter((h) => {
      if (n >= MAX_DIFF_LINES_PER_FILE) { truncated = true; return false }
      n += h.lines.length
      return true
    })
  }
  return { files: kept, truncated }
}

export async function getCommit(repo: string, sha: string): Promise<CommitDetail> {
  assertRef(sha)
  const [summary] = parseLog(await text(repo, ['show', '-s', `--format=${LOG_FMT}`, sha, '--']))
  if (!summary) throw new Error(`Commit not found: ${sha}`)
  const raw = summary.parents.length
    ? await text(repo, ['diff', '-M', '--no-color', '--no-ext-diff', '--no-textconv', summary.parents[0], summary.sha, '--'])
    : await text(repo, ['show', '--format=', '-p', '-M', '--no-color', '--no-ext-diff', '--no-textconv', summary.sha, '--'])
  const { files, truncated } = limitDiff(parseDiff(raw))
  return { ...summary, files, truncated }
}

export async function compareRefs(repo: string, base: string, head: string): Promise<CompareResult> {
  assertRef(base); assertRef(head)
  const raw = await text(repo, ['diff', '-M', '--no-color', '--no-ext-diff', '--no-textconv', `${base}...${head}`, '--'])
  const commits = parseLog(await text(repo, ['log', `--format=${LOG_FMT}`, '-n', '200', `${base}..${head}`, '--']))
  const { files, truncated } = limitDiff(parseDiff(raw))
  return { base, head, commits, files, truncated }
}
