import { spawn } from 'child_process'
import { accessSync, constants, statSync } from 'fs'
import { tmpdir } from 'os'
import { delimiter, isAbsolute, join } from 'path'

export type CredentialSource = 'gh' | 'git-credential'
export interface FoundToken { token: string; source: CredentialSource }

/** Runs a program and returns its stdout; resolves null on any failure (missing program, non-zero exit, timeout). */
export type Runner = (cmd: string, args: string[], input?: string) => Promise<string | null>

/**
 * Finds an executable on PATH ourselves instead of letting spawn do it: on Windows spawn also looks in the working
 * directory first, and a planted gh.exe/git.exe in a user-writable folder would then receive the token request.
 * Only absolute PATH entries are used, and on Windows only real .exe files (no .cmd/.bat shims, which need a shell).
 */
export function resolveOnPath(cmd: string, pathVar = process.env['PATH'] ?? process.env['Path'] ?? '', platform: NodeJS.Platform = process.platform): string | null {
  const names = platform === 'win32' ? [`${cmd}.exe`] : [cmd]
  for (const dir of pathVar.split(platform === 'win32' ? ';' : delimiter)) {
    const d = dir.trim().replace(/^"(.*)"$/, '$1')
    if (!d || !isAbsolute(d)) continue
    for (const n of names) {
      const full = join(d, n)
      try {
        if (!statSync(full).isFile()) continue
        if (platform !== 'win32') accessSync(full, constants.X_OK)
        return full
      } catch { /* not here */ }
    }
  }
  return null
}

export const runProgram: Runner = (cmd, args, input) => {
  const exe = resolveOnPath(cmd)
  if (!exe) return Promise.resolve(null)
  return new Promise((resolve) => {
    let out = ''
    let done = false
    const finish = (v: string | null): void => { if (!done) { done = true; clearTimeout(timer); resolve(v) } }
    // cwd is a neutral folder so no repository's own config is involved; prompts are disabled so nothing hangs.
    const child = spawn(exe, args, {
      cwd: tmpdir(), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1', GIT_ASKPASS: '', SSH_ASKPASS: '' }
    })
    const timer = setTimeout(() => { child.kill(); finish(null) }, 15000)
    child.stdout.on('data', (d: Buffer) => { if (out.length < 65536) out += d.toString('utf8') })
    child.on('error', () => finish(null))
    child.on('close', (code) => finish(code === 0 ? out : null))
    child.stdin.on('error', () => undefined)
    child.stdin.end(input ?? '')
  })
}

const TOKEN_RE = /^[\x21-\x7e]{20,255}$/

/**
 * Looks for an existing GitHub credential on this machine: the GitHub CLI's token first, then whatever git's
 * credential helper (Git Credential Manager on Windows) stores for github.com. Reads only; never prompts (terminal and askpass prompts are disabled, so a missing credential fails instead of asking).
 * Only called when the user explicitly asks to reuse their login.
 */
export async function findGithubToken(run: Runner = runProgram): Promise<FoundToken | null> {
  const gh = (await run('gh', ['auth', 'token', '--hostname', 'github.com']))?.trim()
  if (gh && TOKEN_RE.test(gh)) return { token: gh, source: 'gh' }

  const fill = await run('git', ['-c', 'core.askPass=', 'credential', 'fill'], 'protocol=https\nhost=github.com\n\n')
  const password = fill?.split(/\r?\n/).find((l) => l.startsWith('password='))?.slice('password='.length).trim()
  if (password && TOKEN_RE.test(password)) return { token: password, source: 'git-credential' }
  return null
}
