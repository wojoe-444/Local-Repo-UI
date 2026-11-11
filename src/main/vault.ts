import { chmod, rename, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { AuthStatus } from '../shared/types'
import { readJson, writeJsonAtomic } from './jsonfile'

/** The slice of Electron's `safeStorage` we use (DPAPI on Windows, Keychain on macOS, libsecret/kwallet on Linux). */
export interface SecretBox {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(cipher: Buffer): string
  /** Linux only: 'basic_text' means there is no real keyring and the "encryption" is merely obfuscation. */
  getSelectedStorageBackend?(): string
}

/** `avatarUrl` is a data: URL fetched once at sign-in, so showing who is signed in never needs the network. */
export interface Profile { login: string; name: string | null; avatarUrl: string | null }

/**
 * Holds the GitHub token. It is only ever persisted encrypted by the OS; without a usable keyring it stays in memory
 * for the session. The (non-secret) profile is stored next to it so the app can show who is signed in while offline.
 */
export function createVault(dir: string, box: SecretBox) {
  const tokenFile = join(dir, 'github-token.bin')
  const profileFile = join(dir, 'github-profile.json')
  let token: string | null = null
  let profile: Profile | null = null
  let loading: Promise<void> | null = null
  /** Set once sign-in/out has changed the state, so a slower initial load can never overwrite it. */
  let touched = false

  const canPersist = (): boolean => {
    try {
      return box.isEncryptionAvailable() && box.getSelectedStorageBackend?.() !== 'basic_text'
    } catch { return false }
  }

  /** Concurrent callers share one load: a second caller must not see the empty state while the first is still reading. */
  function load(): Promise<void> {
    loading ??= (async () => {
      if (!canPersist()) return
      try {
        const t = box.decryptString(await readFile(tokenFile))
        const p = await readJson<Profile | null>(profileFile, null)
        if (touched) return
        token = t
        profile = p
      } catch {
        // Missing, or encrypted under another OS account/machine: treat as signed out.
      }
    })()
    return loading
  }

  return {
    async status(): Promise<AuthStatus> {
      await load()
      return { signedIn: !!token && !!profile, login: profile?.login ?? null, name: profile?.name ?? null, avatarUrl: profile?.avatarUrl ?? null, canPersist: canPersist() }
    },
    /** Synchronous accessor for the API client; `load()` has always run by the time a request is made. */
    getToken: (): string | null => token,
    load,
    async save(newToken: string, who: Profile): Promise<void> {
      await load()
      if (canPersist()) {
        // Persist first: if this throws, the user is told and nothing is half signed in.
        await mkdir(dir, { recursive: true })
        const tmp = `${tokenFile}.${process.pid}.tmp`
        try {
          await writeFile(tmp, box.encryptString(newToken), { mode: 0o600 })
          await chmod(tmp, 0o600).catch(() => undefined)
          await rename(tmp, tokenFile)
        } catch (e) {
          await rm(tmp, { force: true }).catch(() => undefined)
          throw e
        }
        await writeJsonAtomic(profileFile, who)
      }
      touched = true
      token = newToken
      profile = who
    },
    async clear(): Promise<void> {
      touched = true
      token = null
      profile = null
      await rm(tokenFile, { force: true })
      await rm(profileFile, { force: true })
    }
  }
}
export type Vault = ReturnType<typeof createVault>
