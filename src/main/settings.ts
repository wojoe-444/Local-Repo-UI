import { join } from 'path'
import { readJson, writeJsonAtomic, createKeyedQueue } from './jsonfile'
import { repoKey } from './local-issues'

interface SettingsFile {
  version: 1
  /** Repos (by normalised path) that must never use GitHub, even if they have a github.com remote. */
  localOnly: string[]
  /** "owner/name" (lower-case) -> path of a local clone. */
  clones: Record<string, string>
}

const EMPTY: SettingsFile = { version: 1, localOnly: [], clones: {} }

/** Small per-user settings file in the app's data folder. */
export function createSettings(dir: string, platform: NodeJS.Platform = process.platform) {
  const file = join(dir, 'settings.json')
  const queue = createKeyedQueue()
  const load = async (): Promise<SettingsFile> => {
    const s = await readJson<Partial<SettingsFile>>(file, EMPTY)
    return { version: 1, localOnly: Array.isArray(s.localOnly) ? s.localOnly : [], clones: s.clones && typeof s.clones === 'object' ? s.clones : {} }
  }
  const update = (fn: (s: SettingsFile) => void): Promise<void> =>
    queue(file, async () => { const s = await load(); fn(s); await writeJsonAtomic(file, s) })
  const slug = (owner: string, name: string): string => `${owner}/${name}`.toLowerCase()

  return {
    async isLocalOnly(repoPath: string): Promise<boolean> {
      return (await load()).localOnly.includes(repoKey(repoPath, platform))
    },
    setLocalOnly(repoPath: string, on: boolean): Promise<void> {
      const k = repoKey(repoPath, platform)
      return update((s) => { s.localOnly = s.localOnly.filter((x) => x !== k); if (on) s.localOnly.push(k) })
    },
    async getClone(owner: string, name: string): Promise<string | null> {
      return (await load()).clones[slug(owner, name)] ?? null
    },
    setClone(owner: string, name: string, path: string): Promise<void> {
      return update((s) => { s.clones[slug(owner, name)] = path })
    },
    async allClones(): Promise<Record<string, string>> { return (await load()).clones }
  }
}
export type Settings = ReturnType<typeof createSettings>
