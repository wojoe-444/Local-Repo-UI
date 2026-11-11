import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as git from '../src/main/git'
import { parseDiff } from '../src/main/diff'

let dir: string
const g = (...a: string[]): string => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'lru-'))
  g('init', '-q', '-b', 'main')
  g('config', 'user.email', 't@t'); g('config', 'user.name', 'Tester')
  writeFileSync(join(dir, 'README.md'), '# Hi\n')
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(dir, 'bin.dat'), Buffer.from([0, 1, 2, 3]))
  g('add', '.'); g('commit', '-qm', 'initial')
  g('checkout', '-qb', 'feature/x')
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\nexport const b = 3\n')
  g('commit', '-qam', 'change a\n\nbody text')
  g('tag', 'v1')
  g('checkout', '-q', 'main')
})

describe('github remote detection', () => {
  it('parses every common remote URL form', () => {
    for (const url of [
      'https://github.com/acme/app.git', 'https://github.com/acme/app', 'https://user:tok@github.com/acme/app.git',
      'git@github.com:acme/app.git', 'ssh://git@github.com/acme/app.git', 'git://github.com/acme/app.git', 'https://github.com/acme/app/'
    ]) expect(git.parseGithubRemote(url), url).toEqual({ owner: 'acme', name: 'app' })
    expect(git.parseGithubRemote('https://github.com/acme/my.repo.git')).toEqual({ owner: 'acme', name: 'my.repo' })
    for (const url of ['https://gitlab.com/acme/app.git', 'https://github.com.evil.io/acme/app', 'C:\\repos\\app', '/srv/git/app.git', 'https://github.com/acme'])
      expect(git.parseGithubRemote(url), url).toBeNull()
  })
  it('finds the remote from config, preferring origin, and is null for local-only repos', async () => {
    const d = mkdtempSync(join(tmpdir(), 'lru-remote-'))
    execFileSync('git', ['init', '-q'], { cwd: d })
    expect(await git.findGithubRemote(d)).toBeNull()
    execFileSync('git', ['remote', 'add', 'fork', 'git@github.com:me/app.git'], { cwd: d })
    expect(await git.findGithubRemote(d)).toEqual({ owner: 'me', name: 'app', remote: 'fork' })
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/app.git'], { cwd: d })
    expect(await git.findGithubRemote(d)).toEqual({ owner: 'acme', name: 'app', remote: 'origin' })
    expect((await git.openRepo(d)).githubRemote?.owner).toBe('acme')
    expect((await git.openRepo(dir)).githubRemote).toBeNull()
  })
})

describe('git service', () => {
  it('opens repo and picks default ref', async () => {
    const i = await git.openRepo(dir)
    expect(i.currentBranch).toBe('main')
    expect(i.defaultRef).toBe('main')
    await expect(git.openRepo(tmpdir())).rejects.toThrow()
  })
  it('lists refs with ahead/behind', async () => {
    const refs = await git.listRefs(dir)
    const f = refs.find((r) => r.name === 'feature/x')!
    expect(f.ahead).toBe(1); expect(f.behind).toBe(0)
    expect(refs.some((r) => r.type === 'tag' && r.name === 'v1')).toBe(true)
  })
  it('lists tree dirs first with last commit', async () => {
    const t = await git.listTree(dir, 'main', '')
    expect(t.map((e) => e.name)).toEqual(['src', 'bin.dat', 'README.md'].sort((a, b) => (a === 'src' ? -1 : b === 'src' ? 1 : a.localeCompare(b, undefined, { sensitivity: 'base' }))))
    expect(t[0].lastCommit?.subject).toBe('initial')
    const sub = await git.listTree(dir, 'main', 'src')
    expect(sub[0].name).toBe('a.ts')
  })
  it('reads blobs', async () => {
    const b = await git.readBlob(dir, 'feature/x', 'src/a.ts')
    expect(b.kind === 'text' && b.content).toContain('b = 3')
    expect((await git.readBlob(dir, 'main', 'bin.dat')).kind).toBe('binary')
  })
  it('logs and commit detail', async () => {
    const { commits } = await git.getLog(dir, { ref: 'feature/x' })
    expect(commits.map((c) => c.subject)).toEqual(['change a', 'initial'])
    expect(commits[0].body).toBe('body text')
    const d = await git.getCommit(dir, commits[0].sha)
    expect(d.files[0]).toMatchObject({ newPath: 'src/a.ts', additions: 2, deletions: 1 })
    const root = await git.getCommit(dir, commits[1].sha)
    expect(root.files.every((f) => f.status === 'added')).toBe(true)
  })
  it('compares refs', async () => {
    const c = await git.compareRefs(dir, 'main', 'feature/x')
    expect(c.commits).toHaveLength(1)
    expect(c.files).toHaveLength(1)
  })
  it('rejects option-like refs and traversal', async () => {
    await expect(git.getLog(dir, { ref: '--output=x' })).rejects.toThrow()
    await expect(git.readBlob(dir, 'main', '../x')).rejects.toThrow()
    await expect(git.compareRefs(dir, 'main', '--output=x')).rejects.toThrow()
    await expect(git.getCommit(dir, '--help')).rejects.toThrow()
    await expect(git.getLog(dir, { ref: 'main', skip: '--output=x' as unknown as number })).resolves.toBeTruthy()
  })
  it('never runs repo-configured textconv/external diff programs', async () => {
    const marker = join(dir, 'pwned.txt')
    writeFileSync(join(dir, '.gitattributes'), '*.ts diff=evil\n')
    g('config', 'diff.evil.textconv', `touch "${marker.replace(/\\/g, '/')}" #`)
    g('config', 'diff.evil.command', `touch "${marker.replace(/\\/g, '/')}" #`)
    await git.compareRefs(dir, 'main', 'feature/x')
    const { commits } = await git.getLog(dir, { ref: 'feature/x' })
    await git.getCommit(dir, commits[0].sha)
    expect(existsSync(marker)).toBe(false)
  })
})

describe('parseDiff', () => {
  it('tracks line numbers and renames', () => {
    const f = parseDiff('diff --git a/x b/y\nsimilarity index 90%\nrename from x\nrename to y\n--- a/x\n+++ b/y\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n')
    expect(f[0].status).toBe('renamed')
    expect(f[0].hunks[0].lines.map((l) => [l.type, l.oldNo, l.newNo])).toEqual([['context', 1, 1], ['del', 2, null], ['add', null, 2]])
  })
})
