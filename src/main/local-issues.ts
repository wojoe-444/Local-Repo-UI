import { createHash } from 'crypto'
import { rename } from 'fs/promises'
import { join, resolve } from 'path'
import type {
  Issue, IssueComment, IssueCreateInput, IssueDetail, IssueLabel, IssueList, IssueListOptions, IssueStateReason,
  IssueUpdateInput, IssueUser, LabelCreateInput, TimelineItem
} from '../shared/types'
import { createKeyedQueue, readJson, writeJsonAtomic } from './jsonfile'

export const PAGE_SIZE = 25
export const MAX_TITLE = 256
export const MAX_BODY = 65536

/** Stable identity for a repository on this machine: its normalised absolute path. */
export function repoKey(repoPath: string, platform: NodeJS.Platform = process.platform): string {
  let p = platform === 'win32' ? repoPath.replace(/\\/g, '/') : repoPath
  p = p.replace(/\/+$/, '') || '/'
  return platform === 'win32' ? p.toLowerCase() : resolve(p)
}

export const DEFAULT_LABELS: IssueLabel[] = [
  { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
  { name: 'documentation', color: '0075ca', description: 'Improvements or additions to documentation' },
  { name: 'duplicate', color: 'cfd3d7', description: 'This issue or pull request already exists' },
  { name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
  { name: 'good first issue', color: '7057ff', description: 'Good for newcomers' },
  { name: 'help wanted', color: '008672', description: 'Extra attention is needed' },
  { name: 'invalid', color: 'e4e669', description: "This doesn't seem right" },
  { name: 'question', color: 'd876e3', description: 'Further information is requested' },
  { name: 'wontfix', color: 'ffffff', description: 'This will not be worked on' }
]

interface StoredIssue extends Omit<Issue, 'comments' | 'labels' | 'htmlUrl' | 'assignees'> {
  /** Label names; resolved against the repo's label table on read. */
  labels: string[]
  comments: IssueComment[]
  events: Extract<TimelineItem, { type: 'event' }>[]
}

interface StoreFile {
  version: 1
  repoPath: string
  nextNumber: number
  labels: IssueLabel[]
  issues: StoredIssue[]
}

export class IssueInputError extends Error {}

export function checkTitle(title: unknown): string {
  if (typeof title !== 'string' || !title.trim()) throw new IssueInputError('A title is required')
  if (title.length > MAX_TITLE) throw new IssueInputError(`Title is too long (max ${MAX_TITLE} characters)`)
  return title.trim()
}
export function checkBody(body: unknown): string {
  if (body === undefined || body === null) return ''
  if (typeof body !== 'string') throw new IssueInputError('Invalid body')
  if (body.length > MAX_BODY) throw new IssueInputError(`Body is too long (max ${MAX_BODY} characters)`)
  return body
}
export function checkLabelList(labels: unknown): string[] {
  if (labels === undefined) return []
  if (!Array.isArray(labels) || labels.some((l) => typeof l !== 'string')) throw new IssueInputError('Invalid labels')
  return [...new Set(labels as string[])]
}
export function checkLabelInput(input: LabelCreateInput): IssueLabel {
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 50) throw new IssueInputError('Label name must be 1-50 characters')
  const color = typeof input.color === 'string' ? input.color.replace(/^#/, '').toLowerCase() : ''
  if (!/^[0-9a-f]{6}$/.test(color)) throw new IssueInputError('Label colour must be six hex digits')
  const description = typeof input.description === 'string' && input.description.trim() ? input.description.trim().slice(0, 100) : null
  return { name, color, description }
}

/**
 * Issues for repositories that are only on this machine. Each repository gets one JSON file in the app's data
 * folder; nothing here can reach the network.
 */
export function createLocalIssues(dir: string, platform: NodeJS.Platform = process.platform) {
  const queue = createKeyedQueue()
  const fileFor = (repoPath: string): string =>
    join(dir, 'local-issues', `${createHash('sha1').update(repoKey(repoPath, platform)).digest('hex')}.json`)

  async function load(repoPath: string): Promise<StoreFile> {
    const fresh: StoreFile = { version: 1, repoPath, nextNumber: 1, labels: DEFAULT_LABELS.map((l) => ({ ...l })), issues: [] }
    const s = await readJson<StoreFile | null>(fileFor(repoPath), null)
    if (!s) return fresh
    // A valid-JSON file of the wrong shape must not crash every issue call; keep it aside and start fresh.
    if (typeof s !== 'object' || !Array.isArray(s.issues) || !Array.isArray(s.labels) || !Number.isSafeInteger(s.nextNumber)) {
      await rename(fileFor(repoPath), `${fileFor(repoPath)}.corrupt-${Date.now()}`).catch(() => undefined)
      return fresh
    }
    return s
  }
  /** Read-modify-write under a per-repo lock. */
  function mutate<T>(repoPath: string, fn: (s: StoreFile) => T): Promise<T> {
    const f = fileFor(repoPath)
    return queue(f, async () => {
      const s = await load(repoPath)
      const result = fn(s)
      await writeJsonAtomic(f, s)
      return result
    })
  }

  const labelMap = (s: StoreFile): Map<string, IssueLabel> => new Map(s.labels.map((l) => [l.name.toLowerCase(), l]))
  const toIssue = (s: StoreFile, i: StoredIssue): Issue => {
    const lm = labelMap(s)
    return {
      number: i.number, title: i.title, body: i.body, state: i.state, stateReason: i.stateReason, author: i.author,
      labels: i.labels.flatMap((n) => lm.get(n.toLowerCase()) ?? []), assignees: [], comments: i.comments.length,
      createdAt: i.createdAt, updatedAt: i.updatedAt, closedAt: i.closedAt, htmlUrl: null
    }
  }
  const resolveLabels = (s: StoreFile, names: string[]): string[] => {
    const lm = labelMap(s)
    return names.map((n) => {
      const l = lm.get(n.toLowerCase())
      if (!l) throw new IssueInputError(`Unknown label: ${n}`)
      return l.name
    })
  }
  const find = (s: StoreFile, n: number): StoredIssue => {
    const i = s.issues.find((x) => x.number === n)
    if (!i) throw new IssueInputError(`Issue #${n} not found`)
    return i
  }

  return {
    async list(repoPath: string, o: IssueListOptions): Promise<IssueList> {
      const s = await load(repoPath)
      const q = o.query?.trim().toLowerCase()
      const wanted = (o.labels ?? []).map((l) => l.toLowerCase())
      const matching = s.issues.filter((i) =>
        (!q || i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q)) &&
        wanted.every((w) => i.labels.some((l) => l.toLowerCase() === w)))
      const inState = matching.filter((i) => i.state === o.state).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number)
      const page = Math.max(1, Math.floor(o.page) || 1)
      const slice = inState.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      return {
        issues: slice.map((i) => toIssue(s, i)),
        hasNext: inState.length > page * PAGE_SIZE,
        counts: { open: matching.filter((i) => i.state === 'open').length, closed: matching.filter((i) => i.state === 'closed').length }
      }
    },

    async get(repoPath: string, number: number): Promise<IssueDetail> {
      const s = await load(repoPath)
      const i = find(s, number)
      const timeline: TimelineItem[] = [
        ...i.comments.map((c) => ({ type: 'comment' as const, ...c })),
        ...i.events
      ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      return { issue: toIssue(s, i), timeline, truncated: false }
    },

    async create(repoPath: string, input: IssueCreateInput, author: IssueUser): Promise<Issue> {
      const title = checkTitle(input?.title)
      const body = checkBody(input.body)
      const labels = checkLabelList(input.labels)
      return mutate(repoPath, (s) => {
        const now = new Date().toISOString()
        const issue: StoredIssue = {
          number: s.nextNumber++, title, body, state: 'open', stateReason: null, author,
          labels: resolveLabels(s, labels), comments: [], events: [], createdAt: now, updatedAt: now, closedAt: null
        }
        s.issues.push(issue)
        return toIssue(s, issue)
      })
    },

    async update(repoPath: string, number: number, patch: IssueUpdateInput, actor: IssueUser): Promise<Issue> {
      const title = patch?.title !== undefined ? checkTitle(patch.title) : undefined
      const body = patch?.body !== undefined ? checkBody(patch.body) : undefined
      const labels = patch?.labels !== undefined ? checkLabelList(patch.labels) : undefined
      if (patch.state !== undefined && patch.state !== 'open' && patch.state !== 'closed') throw new IssueInputError('Invalid state')
      return mutate(repoPath, (s) => {
        const i = find(s, number)
        const now = new Date().toISOString()
        if (title !== undefined) i.title = title
        if (body !== undefined) i.body = body
        if (labels !== undefined) i.labels = resolveLabels(s, labels)
        if (patch.state && patch.state !== i.state) {
          const reason: IssueStateReason = patch.state === 'closed' ? (patch.stateReason === 'not_planned' ? 'not_planned' : 'completed') : 'reopened'
          i.state = patch.state
          i.stateReason = reason
          i.closedAt = patch.state === 'closed' ? now : null
          i.events.push({ type: 'event', id: `e${i.events.length + 1}`, event: patch.state === 'closed' ? 'closed' : 'reopened', actor, createdAt: now, stateReason: reason })
        }
        i.updatedAt = now
        return toIssue(s, i)
      })
    },

    async comment(repoPath: string, number: number, bodyIn: string, author: IssueUser): Promise<IssueComment> {
      const body = checkBody(bodyIn)
      if (!body.trim()) throw new IssueInputError('Comment cannot be empty')
      return mutate(repoPath, (s) => {
        const i = find(s, number)
        const now = new Date().toISOString()
        const c: IssueComment = { id: `c${i.comments.length + 1}`, author, body, createdAt: now, updatedAt: now }
        i.comments.push(c)
        i.updatedAt = now
        return c
      })
    },

    async labels(repoPath: string): Promise<IssueLabel[]> {
      return (await load(repoPath)).labels
    },

    async createLabel(repoPath: string, input: LabelCreateInput): Promise<IssueLabel> {
      const label = checkLabelInput(input)
      return mutate(repoPath, (s) => {
        if (labelMap(s).has(label.name.toLowerCase())) throw new IssueInputError(`Label "${label.name}" already exists`)
        s.labels.push(label)
        return label
      })
    }
  }
}
export type LocalIssues = ReturnType<typeof createLocalIssues>
