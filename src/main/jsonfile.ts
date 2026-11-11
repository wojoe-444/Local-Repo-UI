import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { dirname } from 'path'

/** Reads JSON, returning `fallback` when the file does not exist. A corrupt file is moved aside, never overwritten. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw e
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    await rename(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined)
    return fallback
  }
}

/** On Windows, antivirus or indexers can briefly hold the target open, making rename fail with EPERM/EBUSY. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)))
    }
  }
}

/** Writes via a temp file + rename so a crash mid-write cannot leave a truncated file. */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await renameWithRetry(tmp, file)
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}

/** Serialises async work per key so read-modify-write cycles on one file never interleave. */
export function createKeyedQueue(): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>()
  return (key, fn) => {
    const prev = tails.get(key) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    const settled = next.then(() => undefined, () => undefined)
    tails.set(key, settled)
    void settled.then(() => { if (tails.get(key) === settled) tails.delete(key) })
    return next
  }
}
