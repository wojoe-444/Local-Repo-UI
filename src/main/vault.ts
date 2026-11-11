import { chmod, rm, readFile, writeFile, mkdir } from 'fs/promises'
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
  let loaded = false

  const canPersist = (): boolean => {
    try {
      return box.isEncryptionAvailable() && box.getSelectedStorageBackend?.() !== 'basic_text'
    } catch { return false }
  }

  async function load(): Promise<void> {
    if (loaded) return
    loaded = true
    if (!canPersist()) return
    try {
      token = box.decryptString(await readFile(tokenFile))
      profile = await readJson<Profile | null>(profileFile, null)
    } catch {
      // Missing, or encrypted under another OS account/machine: treat as signed out.
      token = null
      profile = null
    }
  }

  return {
    async status(): Promise<AuthStatus> {
      await load()
      return { signedIn: !!token && !!profile, login: profile?.login ?? null, name: profile?.name ?? null, avatarUrl: profile?.avatarUrl ?? null, canPersist: canPersist() }
    },
    /** Synchronous accessor for the API client; `load()` has always run by the time a request is made. */
    getToken: (): string | null => token,
    async load(): Promise<void> { await load() },
    async save(newToken: string, who: Profile): Promise<void> {
      loaded = true
      token = newToken
      profile = who
      if (!canPersist()) return
      await mkdir(dir, { recursive: true })
      await writeFile(tokenFile, box.encryptString(newToken))
      await chmod(tokenFile, 0o600).catch(() => undefined)
      await writeJsonAtomic(profileFile, who)
    },
    async clear(): Promise<void> {
      loaded = true
      token = null
      profile = null
      await rm(tokenFile, { force: true })
      await rm(profileFile, { force: true })
    }
  }
}
export type Vault = ReturnType<typeof createVault>
