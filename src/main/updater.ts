import type { UpdateState } from '../shared/types'

/** The slice of electron-updater's `AppUpdater` that this module uses (lets tests pass a fake). */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  on(event: string, listener: (...args: any[]) => void): unknown // eslint-disable-line @typescript-eslint/no-explicit-any
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdateService {
  getState(): UpdateState
  check(): Promise<UpdateState>
  download(): Promise<UpdateState>
  /** Quits the app, runs the downloaded installer silently and relaunches the new version. */
  install(): void
}

/** Turns "net::ERR_…" / ENOTFOUND style failures into something a person can act on. */
export function friendlyUpdateError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_NETWORK|ERR_PROXY|ERR_TIMED_OUT/i.test(raw))
    return 'Could not reach GitHub to look for updates. Check your internet connection and try again.'
  if (/404|Cannot find latest\.yml|No published versions/i.test(raw)) return 'No published release was found yet for this app.'
  if (/sha512|checksum/i.test(raw)) return 'The downloaded update failed its integrity check and was discarded. Try again.'
  return raw.split('\n')[0].slice(0, 300)
}

/**
 * Update flow driven entirely by the user: nothing is checked, downloaded or installed until a button is pressed, so a
 * session working on sensitive local repositories makes no background network calls.
 *
 * Updates come from GitHub Releases of this app's own repository (see `build.publish` in package.json). The unsigned
 * installer is verified against the SHA-512 in the release's latest.yml.
 */
export function createUpdateService(opts: {
  updater: UpdaterLike
  currentVersion: string
  /** False for `npm run dev` / unpackaged runs, where there is no installed app to replace. */
  supported: boolean
  onState(s: UpdateState): void
}): UpdateService {
  const { updater } = opts
  let state: UpdateState = opts.supported
    ? { status: 'idle', currentVersion: opts.currentVersion }
    : { status: 'unsupported', currentVersion: opts.currentVersion }
  const cur = (): UpdateState => state
  const set = (patch: Omit<UpdateState, 'currentVersion'>): UpdateState => {
    state = { currentVersion: opts.currentVersion, ...patch }
    opts.onState(state)
    return state
  }

  if (opts.supported) {
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = false
    updater.allowDowngrade = false
    updater.on('checking-for-update', () => set({ status: 'checking' }))
    updater.on('update-available', (info: { version?: string }) => set({ status: 'available', version: String(info?.version ?? '') }))
    updater.on('update-not-available', () => set({ status: 'up-to-date', checkedAt: Date.now() }))
    updater.on('download-progress', (p: { percent?: number }) => {
      if (state.status === 'downloading') set({ status: 'downloading', version: state.version, percent: Math.max(0, Math.min(100, Math.round(p?.percent ?? 0))) })
    })
    updater.on('update-downloaded', (info: { version?: string }) => set({ status: 'downloaded', version: String(info?.version ?? state.version ?? '') }))
    updater.on('error', (e: unknown) => {
      // A failed check or download leaves the user where they were; show why and let them retry.
      set({ status: 'error', error: friendlyUpdateError(e), version: state.version })
    })
  }

  return {
    getState: () => state,
    async check() {
      if (!opts.supported) return state
      if (state.status === 'checking' || state.status === 'downloading' || state.status === 'downloaded') return state
      set({ status: 'checking' })
      try { await updater.checkForUpdates() } catch (e) {
        // electron-updater also emits 'error', but not for every failure path; make sure the state reflects it.
        if (cur().status === 'checking') set({ status: 'error', error: friendlyUpdateError(e) })
      }
      if (cur().status === 'checking') set({ status: 'up-to-date', checkedAt: Date.now() })
      return state
    },
    async download() {
      if (!opts.supported) return state
      if (state.status !== 'available' && !(state.status === 'error' && state.version)) throw new Error('There is no update to download')
      const version = state.version
      set({ status: 'downloading', version, percent: 0 })
      try { await updater.downloadUpdate() } catch (e) {
        if (cur().status === 'downloading') set({ status: 'error', error: friendlyUpdateError(e), version })
      }
      return state
    },
    install() {
      if (state.status !== 'downloaded') throw new Error('No downloaded update is ready to install')
      updater.quitAndInstall(true, true)
    }
  }
}
