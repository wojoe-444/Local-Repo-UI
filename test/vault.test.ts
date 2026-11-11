import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createVault, type SecretBox } from '../src/main/vault'

const box = (over: Partial<SecretBox> = {}): SecretBox => ({
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s, 'utf8').reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString('utf8'),
  ...over
})
const who = { login: 'walter', name: 'Walter', avatarUrl: null }
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lru-vault-')) })

describe('token vault', () => {
  it('persists the token encrypted and restores it', async () => {
    const v = createVault(dir, box())
    await v.save('ghp_supersecrettoken1234567890', who)
    expect(readFileSync(join(dir, 'github-token.bin')).toString('utf8')).not.toContain('supersecret')
    const again = createVault(dir, box())
    expect((await again.status()).login).toBe('walter')
    expect(again.getToken()).toBe('ghp_supersecrettoken1234567890')
  })

  it('keeps the token in memory only when the OS cannot encrypt', async () => {
    for (const b of [box({ isEncryptionAvailable: () => false }), box({ getSelectedStorageBackend: () => 'basic_text' })]) {
      const d = mkdtempSync(join(tmpdir(), 'lru-vault-'))
      const v = createVault(d, b)
      await v.save('tok'.repeat(10), who)
      expect(v.getToken()).toBeTruthy()
      expect((await v.status()).canPersist).toBe(false)
      expect(existsSync(join(d, 'github-token.bin'))).toBe(false)
      expect(await createVault(d, b).status()).toMatchObject({ signedIn: false })
    }
  })

  it('treats an undecryptable token as signed out, and clears on sign out', async () => {
    await createVault(dir, box()).save('tok'.repeat(10), who)
    const broken = createVault(dir, box({ decryptString: () => { throw new Error('different user') } }))
    expect((await broken.status()).signedIn).toBe(false)
    const v = createVault(dir, box())
    expect((await v.status()).signedIn).toBe(true)
    await v.clear()
    expect(v.getToken()).toBeNull()
    expect(existsSync(join(dir, 'github-token.bin'))).toBe(false)
    expect((await createVault(dir, box()).status()).signedIn).toBe(false)
  })
})
