import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'events'
import { createUpdateService, friendlyUpdateError, type UpdaterLike } from '../src/main/updater'
import type { UpdateState } from '../src/shared/types'

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = false
  allowPrerelease = true
  allowDowngrade = true
  installed: unknown[] | null = null
  onCheck: () => Promise<void> = async () => { this.emit('update-not-available', {}) }
  onDownload: () => Promise<void> = async () => { this.emit('update-downloaded', { version: '0.2.0' }) }
  checkForUpdates(): Promise<unknown> { this.emit('checking-for-update'); return this.onCheck() }
  downloadUpdate(): Promise<unknown> { return this.onDownload() }
  quitAndInstall(...a: unknown[]): void { this.installed = a }
}
const setup = (supported = true) => {
  const u = new FakeUpdater()
  const seen: UpdateState[] = []
  const svc = createUpdateService({ updater: u as unknown as UpdaterLike, currentVersion: '0.1.0', supported, onState: (s) => seen.push(s) })
  return { u, svc, seen }
}

describe('update service', () => {
  it('never auto-downloads or accepts prereleases/downgrades', () => {
    const { u } = setup()
    expect(u.autoDownload).toBe(false)
    expect(u.allowPrerelease).toBe(false)
    expect(u.allowDowngrade).toBe(false)
  })

  it('is inert in unpackaged runs', async () => {
    const { u, svc } = setup(false)
    expect(svc.getState()).toEqual({ status: 'unsupported', currentVersion: '0.1.0' })
    expect((await svc.check()).status).toBe('unsupported')
    expect(u.listenerCount('update-available')).toBe(0)
    expect(() => svc.install()).toThrow()
  })

  it('does nothing until asked: idle at start', () => {
    expect(setup().svc.getState().status).toBe('idle')
  })

  it('reports up to date', async () => {
    const { svc } = setup()
    const s = await svc.check()
    expect(s.status).toBe('up-to-date')
    expect(s.checkedAt).toBeTypeOf('number')
  })

  it('finds an update, downloads it on request, then installs silently and relaunches', async () => {
    const { u, svc, seen } = setup()
    u.onCheck = async () => { u.emit('update-available', { version: '0.2.0' }) }
    expect(await svc.check()).toMatchObject({ status: 'available', version: '0.2.0', currentVersion: '0.1.0' })
    u.onDownload = async () => {
      u.emit('download-progress', { percent: 42.4 })
      u.emit('update-downloaded', { version: '0.2.0' })
    }
    expect((await svc.download()).status).toBe('downloaded')
    expect(seen.some((s) => s.status === 'downloading' && s.percent === 42)).toBe(true)
    svc.install()
    expect(u.installed).toEqual([true, true])
  })

  it('refuses to download or install without a found/downloaded update', async () => {
    const { svc } = setup()
    await expect(svc.download()).rejects.toThrow(/no update/i)
    expect(() => svc.install()).toThrow()
  })

  it('surfaces check failures and can retry', async () => {
    const { u, svc } = setup()
    u.onCheck = async () => { const e = new Error('getaddrinfo ENOTFOUND github.com'); u.emit('error', e); throw e }
    const s = await svc.check()
    expect(s.status).toBe('error')
    expect(s.error).toMatch(/internet connection/)
    u.onCheck = async () => { u.emit('update-not-available', {}) }
    expect((await svc.check()).status).toBe('up-to-date')
  })

  it('records an error when the check throws without emitting one', async () => {
    const { u, svc } = setup()
    u.onCheck = async () => { throw new Error('boom') }
    expect(await svc.check()).toMatchObject({ status: 'error', error: 'boom' })
  })

  it('keeps the found version after a failed download so it can be retried', async () => {
    const { u, svc } = setup()
    u.onCheck = async () => { u.emit('update-available', { version: '0.2.0' }) }
    await svc.check()
    u.onDownload = async () => { throw new Error('sha512 checksum mismatch') }
    const s = await svc.download()
    expect(s).toMatchObject({ status: 'error', version: '0.2.0' })
    expect(s.error).toMatch(/integrity/)
    u.onDownload = async () => { u.emit('update-downloaded', { version: '0.2.0' }) }
    expect((await svc.download()).status).toBe('downloaded')
  })

  it('ignores a second check while one is running', async () => {
    const { u, svc } = setup()
    let calls = 0
    let release!: () => void
    u.onCheck = () => { calls++; return new Promise<void>((r) => { release = () => { u.emit('update-not-available', {}); r() } }) }
    const a = svc.check()
    const b = await svc.check()
    expect(b.status).toBe('checking')
    release()
    await a
    expect(calls).toBe(1)
  })
})

describe('friendlyUpdateError', () => {
  it('maps common failures', () => {
    expect(friendlyUpdateError(new Error('net::ERR_INTERNET_DISCONNECTED'))).toMatch(/internet/)
    expect(friendlyUpdateError(new Error('Cannot find latest.yml in the latest release artifacts'))).toMatch(/No published release/)
    expect(friendlyUpdateError('weird\nsecond line')).toBe('weird')
  })
})
