import { spawn } from 'child_process'
import { tmpdir } from 'os'

export type CredentialSource = 'gh' | 'git-credential'
export interface FoundToken { token: string; source: CredentialSource }

/** Runs a program and returns its stdout; resolves null on any failure (missing program, non-zero exit, timeout). */
export type Runner = (cmd: string, args: string[], input?: string) => Promise<string | null>

export const runProgram: Runner = (cmd, args, input) =>
  new Promise((resolve) => {
    let out = ''
    let done = false
    const finish = (v: string | null): void => { if (!done) { done = true; clearTimeout(timer); resolve(v) } }
    // cwd is a neutral folder so no repository's own config is involved; prompts are disabled so nothing hangs.
    const child = spawn(cmd, args, {
      cwd: tmpdir(), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' }
    })
    const timer = setTimeout(() => { child.kill(); finish(null) }, 15000)
    child.stdout.on('data', (d: Buffer) => { if (out.length < 65536) out += d.toString('utf8') })
    child.on('error', () => finish(null))
    child.on('close', (code) => finish(code === 0 ? out : null))
    child.stdin.on('error', () => undefined)
    child.stdin.end(input ?? '')
  })

const TOKEN_RE = /^[\x21-\x7e]{20,255}$/

/**
 * Looks for an existing GitHub credential on this machine: the GitHub CLI's token first, then whatever git's
 * credential helper (Git Credential Manager on Windows) stores for github.com. Reads only; never prompts.
 * Only called when the user explicitly asks to reuse their login.
 */
export async function findGithubToken(run: Runner = runProgram): Promise<FoundToken | null> {
  const gh = (await run('gh', ['auth', 'token', '--hostname', 'github.com']))?.trim()
  if (gh && TOKEN_RE.test(gh)) return { token: gh, source: 'gh' }

  const fill = await run('git', ['credential', 'fill'], 'protocol=https\nhost=github.com\n\n')
  const password = fill?.split(/\r?\n/).find((l) => l.startsWith('password='))?.slice('password='.length).trim()
  if (password && TOKEN_RE.test(password)) return { token: password, source: 'git-credential' }
  return null
}
