import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createLocalIssues, repoKey, DEFAULT_LABELS, IssueInputError, PAGE_SIZE } from '../src/main/local-issues'
import { createSettings } from '../src/main/settings'

const me = { login: 'walter', avatarUrl: null }
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lru-issues-')) })

describe('local issues', () => {
  it('creates numbered issues and persists them across instances', async () => {
    const a = createLocalIssues(dir)
    const i1 = await a.create('/r/one', { title: ' First ', body: 'hello', labels: ['bug'] }, me)
    const i2 = await a.create('/r/one', { title: 'Second' }, me)
    expect([i1.number, i2.number]).toEqual([1, 2])
    expect(i1.title).toBe('First')
    expect(i1.labels.map((l) => l.name)).toEqual(['bug'])
    const b = createLocalIssues(dir) // fresh instance reads from disk
    const list = await b.list('/r/one', { state: 'open', page: 1 })
    expect(list.issues.map((i) => i.number)).toEqual([2, 1])
    expect(list.counts).toEqual({ open: 2, closed: 0 })
    // a different repo is isolated
    expect((await b.list('/r/two', { state: 'open', page: 1 })).issues).toEqual([])
  })

  it('stores data only under the given data dir', async () => {
    await createLocalIssues(dir).create('/r/one', { title: 'x' }, me)
    const files = readdirSync(join(dir, 'local-issues'))
    expect(files).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(dir, 'local-issues', files[0]), 'utf8')).repoPath).toBe('/r/one')
  })

  it('comments, closes and reopens with timeline events', async () => {
    const s = createLocalIssues(dir)
    await s.create('/r', { title: 'T' }, me)
    await s.comment('/r', 1, 'a comment', me)
    const closed = await s.update('/r', 1, { state: 'closed', stateReason: 'not_planned' }, me)
    expect(closed.state).toBe('closed'); expect(closed.stateReason).toBe('not_planned'); expect(closed.closedAt).toBeTruthy()
    await s.update('/r', 1, { state: 'open' }, me)
    const d = await s.get('/r', 1)
    expect(d.issue.state).toBe('open'); expect(d.issue.comments).toBe(1)
    expect(d.timeline.map((t) => (t.type === 'event' ? t.event : t.type))).toEqual(['comment', 'closed', 'reopened'])
  })

  it('filters by state, label and text, and counts', async () => {
    const s = createLocalIssues(dir)
    await s.create('/r', { title: 'Crash on start', labels: ['bug'] }, me)
    await s.create('/r', { title: 'Add dark mode', body: 'theme please', labels: ['enhancement'] }, me)
    await s.update('/r', 1, { state: 'closed' }, me)
    expect((await s.list('/r', { state: 'closed', page: 1 })).issues.map((i) => i.title)).toEqual(['Crash on start'])
    expect((await s.list('/r', { state: 'open', labels: ['enhancement'], page: 1 })).issues).toHaveLength(1)
    expect((await s.list('/r', { state: 'open', query: 'THEME', page: 1 })).issues).toHaveLength(1)
    expect((await s.list('/r', { state: 'open', labels: ['bug'], page: 1 })).counts).toEqual({ open: 0, closed: 1 })
  })

  it('paginates', async () => {
    const s = createLocalIssues(dir)
    for (let n = 0; n < PAGE_SIZE + 3; n++) await s.create('/r', { title: `i${n}` }, me)
    const p1 = await s.list('/r', { state: 'open', page: 1 })
    const p2 = await s.list('/r', { state: 'open', page: 2 })
    expect(p1.issues).toHaveLength(PAGE_SIZE); expect(p1.hasNext).toBe(true)
    expect(p2.issues).toHaveLength(3); expect(p2.hasNext).toBe(false)
  })

  it('does not lose issues created concurrently', async () => {
    const s = createLocalIssues(dir)
    await Promise.all(Array.from({ length: 12 }, (_, n) => s.create('/r', { title: `c${n}` }, me)))
    const list = await s.list('/r', { state: 'open', page: 1 })
    expect(list.issues).toHaveLength(12)
    expect(new Set(list.issues.map((i) => i.number)).size).toBe(12)
  })

  it('validates input', async () => {
    const s = createLocalIssues(dir)
    await expect(s.create('/r', { title: '   ' }, me)).rejects.toThrow(IssueInputError)
    await expect(s.create('/r', { title: 'x'.repeat(300) }, me)).rejects.toThrow(/too long/)
    await expect(s.create('/r', { title: 'ok', labels: ['nope'] }, me)).rejects.toThrow(/Unknown label/)
    await expect(s.create('/r', { title: 'ok', body: 5 as unknown as string }, me)).rejects.toThrow(IssueInputError)
    await expect(s.comment('/r', 99, 'x', me)).rejects.toThrow(/not found/)
    await s.create('/r', { title: 'ok' }, me)
    await expect(s.comment('/r', 1, '  ', me)).rejects.toThrow(/empty/)
  })

  it('manages labels and replaces the label set on update', async () => {
    const s = createLocalIssues(dir)
    expect((await s.labels('/r')).map((l) => l.name)).toEqual(DEFAULT_LABELS.map((l) => l.name))
    const created = await s.createLabel('/r', { name: 'Urgent', color: '#FF0000' })
    expect(created).toEqual({ name: 'Urgent', color: 'ff0000', description: null })
    await expect(s.createLabel('/r', { name: 'urgent', color: 'ff0000' })).rejects.toThrow(/already exists/)
    await expect(s.createLabel('/r', { name: 'x', color: 'red' })).rejects.toThrow(/hex/)
    await s.create('/r', { title: 'T', labels: ['bug'] }, me)
    const u = await s.update('/r', 1, { labels: ['urgent', 'question'] }, me)
    expect(u.labels.map((l) => l.name)).toEqual(['Urgent', 'question'])
    // defaults of one repo are not shared with another
    expect((await s.labels('/other')).some((l) => l.name === 'Urgent')).toBe(false)
  })

  it('moves a corrupt store aside instead of overwriting it', async () => {
    const s = createLocalIssues(dir)
    await s.create('/r', { title: 'keep me' }, me)
    const f = join(dir, 'local-issues', readdirSync(join(dir, 'local-issues'))[0])
    writeFileSync(f, '{not json')
    await s.create('/r', { title: 'fresh' }, me)
    expect(readdirSync(join(dir, 'local-issues')).some((n) => n.includes('.corrupt-'))).toBe(true)
  })
})

describe('repoKey', () => {
  it('normalises Windows paths regardless of slash style and case', () => {
    expect(repoKey('C:\\Users\\Walte\\Repos\\App\\', 'win32')).toBe(repoKey('c:/users/walte/repos/app', 'win32'))
  })
})

describe('settings', () => {
  it('remembers local-only repos and clones', async () => {
    const s = createSettings(dir)
    expect(await s.isLocalOnly('/r')).toBe(false)
    await s.setLocalOnly('/r', true)
    expect(await createSettings(dir).isLocalOnly('/r')).toBe(true)
    await s.setLocalOnly('/r', false)
    expect(await s.isLocalOnly('/r')).toBe(false)
    await s.setClone('Org', 'Repo', '/clones/repo')
    expect(await createSettings(dir).getClone('org', 'REPO')).toBe('/clones/repo')
  })
})
