import { describe, it, expect } from 'vitest'
import { findGithubToken, type Runner } from '../src/main/git-credential'

const GH = 'gho_' + 'a'.repeat(36)
const GCM = 'ghu_' + 'b'.repeat(36)

describe('existing login discovery', () => {
  it('prefers the GitHub CLI token', async () => {
    const calls: string[] = []
    const run: Runner = async (cmd) => { calls.push(cmd); return cmd === 'gh' ? `${GH}\n` : null }
    expect(await findGithubToken(run)).toEqual({ token: GH, source: 'gh' })
    expect(calls).toEqual(['gh'])
  })

  it('falls back to git credential fill for github.com', async () => {
    let input = ''
    const run: Runner = async (cmd, args, i) => {
      if (cmd === 'gh') return null
      expect(args).toEqual(['credential', 'fill'])
      input = i ?? ''
      return `protocol=https\r\nhost=github.com\r\nusername=walter\r\npassword=${GCM}\r\n`
    }
    expect(await findGithubToken(run)).toEqual({ token: GCM, source: 'git-credential' })
    expect(input).toBe('protocol=https\nhost=github.com\n\n')
  })

  it('returns null when nothing usable is found', async () => {
    expect(await findGithubToken(async () => null)).toBeNull()
    expect(await findGithubToken(async (c) => (c === 'gh' ? 'not a token\nerror' : 'username=x\npassword=short\n'))).toBeNull()
  })
})
