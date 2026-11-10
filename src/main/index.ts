import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { join } from 'path'
import * as git from './git'
import type { RepoApi } from '../shared/api'

/** Repos the user has explicitly opened this session; IPC refuses to touch any other path. */
const openedRepos = new Set<string>()

function guard(repo: string): string {
  if (!openedRepos.has(repo)) throw new Error('Repository has not been opened')
  return repo
}

function registerIpc(): void {
  const h = <K extends keyof RepoApi>(name: K, fn: (...a: Parameters<RepoApi[K]>) => ReturnType<RepoApi[K]>): void => {
    ipcMain.handle(name, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
  }
  h('pickRepoFolder', async () => {
    const r = await dialog.showOpenDialog({ title: 'Open a local git repository', properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  h('openRepo', async (dir) => {
    const info = await git.openRepo(dir)
    openedRepos.add(info.path)
    return info
  })
  h('listRefs', (r) => git.listRefs(guard(r)))
  h('listTree', (r, ref, p) => git.listTree(guard(r), ref, p))
  h('readBlob', (r, ref, p) => git.readBlob(guard(r), ref, p))
  h('getLog', (r, o) => git.getLog(guard(r), o))
  h('countCommits', (r, ref) => git.countCommits(guard(r), ref))
  h('getCommit', (r, sha) => git.getCommit(guard(r), sha))
  h('compareRefs', (r, b, hd) => git.compareRefs(guard(r), b, hd))
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600,
    backgroundColor: '#0d1117', autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  // Nothing in the app should navigate away or open new windows inside Electron.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  registerIpc()
  Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
