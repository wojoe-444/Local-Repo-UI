import { app, BrowserWindow, dialog, ipcMain, Menu, net, safeStorage, shell } from 'electron'
import { stat } from 'fs/promises'
import { join } from 'path'
import * as git from './git'
import { findGithubToken } from './git-credential'
import { GITHUB_API, GithubError, assertRepoId, createGithubClient, fetchAvatar } from './github'
import { createIssueService } from './issue-service'
import { createLocalIssues } from './local-issues'
import { createSettings } from './settings'
import { createVault } from './vault'
import type { RepoApi } from '../shared/api'
import type { AuthStatus, GithubRepo, RepoInfo } from '../shared/types'

/** Repos the user has explicitly opened this session; IPC refuses to touch any other path. */
const openedRepos = new Set<string>()

function guard(repo: string): string {
  if (!openedRepos.has(repo)) throw new Error('Repository has not been opened')
  return repo
}

async function isDir(p: string): Promise<boolean> {
  return stat(p).then((s) => s.isDirectory(), () => false)
}

function registerIpc(): void {
  const dataDir = app.getPath('userData')
  const settings = createSettings(dataDir)
  const vault = createVault(dataDir, safeStorage)
  // Dev-only override so the app can be exercised against a mock server; ignored in packaged builds.
  const apiBase = !app.isPackaged && process.env['LRU_GITHUB_API'] ? process.env['LRU_GITHUB_API'] : GITHUB_API
  // electron's net.fetch honours the OS proxy settings, which node's fetch does not.
  const fetchImpl = ((url: string, init?: RequestInit) => net.fetch(url, init)) as typeof fetch
  const gh = createGithubClient({ getToken: vault.getToken, fetchImpl, baseUrl: apiBase })
  const issues = createIssueService({
    local: createLocalIssues(dataDir),
    gh,
    guard,
    viewerLogin: async () => (await vault.status()).login,
    localAuthor: async (repo) => ({ login: (await git.gitUserName(repo)) ?? 'You', avatarUrl: null })
  })
  const avatars = new Map<string, string | null>()
  let existingLogin: Promise<AuthStatus> | null = null

  const withClone = async (r: GithubRepo): Promise<GithubRepo> => {
    const p = await settings.getClone(r.owner, r.name)
    return { ...r, clonePath: p && (await isDir(p)) ? p : null }
  }

  /** Validates a token against GitHub, then stores it. */
  async function completeSignIn(t: string): Promise<AuthStatus> {
    if (!/^[\x21-\x7e]{20,255}$/.test(t)) throw new Error('That does not look like a GitHub token')
    let who
    try {
      who = await createGithubClient({ getToken: () => t, fetchImpl, baseUrl: apiBase }).getViewer()
    } catch (e) {
      if (e instanceof GithubError && e.code === 'auth') throw new Error('GitHub rejected that token. Check that it was copied completely and has not expired.')
      throw e
    }
    // Fetch the avatar once, now, so the account menu never needs the network (local-only repos stay offline).
    const avatar = who.avatarUrl ? await fetchAvatar(fetchImpl, who.avatarUrl) : null
    await vault.save(t, { login: who.login, name: who.name, avatarUrl: avatar })
    return vault.status()
  }

  const handlers: { [K in keyof RepoApi]: (...a: Parameters<RepoApi[K]>) => ReturnType<RepoApi[K]> } = {
    pickRepoFolder: async () => {
      const r = await dialog.showOpenDialog({ title: 'Open a local git repository', properties: ['openDirectory'] })
      return r.canceled ? null : r.filePaths[0]
    },
    openRepo: async (dir) => {
      const info = await git.openRepo(dir)
      openedRepos.add(info.path)
      // Remember which GitHub repo this checkout belongs to so it shows up as "cloned" in the GitHub list.
      if (info.githubRemote) await settings.setClone(info.githubRemote.owner, info.githubRemote.name, info.path).catch(() => undefined)
      return info
    },
    listRefs: (r) => git.listRefs(guard(r)),
    listTree: (r, ref, p) => git.listTree(guard(r), ref, p),
    readBlob: (r, ref, p) => git.readBlob(guard(r), ref, p),
    getLog: (r, o) => git.getLog(guard(r), o),
    countCommits: (r, ref) => git.countCommits(guard(r), ref),
    getCommit: (r, sha) => git.getCommit(guard(r), sha),
    compareRefs: (r, b, hd) => git.compareRefs(guard(r), b, hd),

    openExternal: async (url) => {
      let u: URL
      try { u = new URL(url) } catch { throw new Error('Invalid URL') }
      if (u.protocol !== 'https:') throw new Error('Only https links can be opened')
      await shell.openExternal(u.toString())
    },

    authStatus: () => vault.status(),
    authSignIn: async (token) => {
      if (typeof token !== 'string') throw new Error('That does not look like a GitHub token')
      return completeSignIn(token.trim())
    },
    authUseExistingLogin: () => {
      // One lookup at a time: repeated clicks must not spawn a pile of processes.
      existingLogin ??= (async () => {
        const found = await findGithubToken()
        if (!found) throw new Error('No existing GitHub login found. Install and sign in with the GitHub CLI (gh auth login), or paste a token instead.')
        try {
          return await completeSignIn(found.token)
        } catch (e) {
          // Only explain credential problems this way; storage or network failures keep their own message.
          const credentialProblem = e instanceof GithubError || (e instanceof Error && /^(GitHub rejected|That does not look)/.test(e.message))
          if (!(e instanceof Error) || !credentialProblem) throw e
          throw new Error(`Found a credential from ${found.source === 'gh' ? 'the GitHub CLI' : 'git’s credential helper'}, but GitHub did not accept it for API use. Paste a token instead. (${e.message})`)
        }
      })().finally(() => { existingLogin = null })
      return existingLogin
    },
    authSignOut: async () => { await vault.clear(); return vault.status() },
    githubListRepos: async () => {
      await vault.load()
      const [repos, clones] = await Promise.all([gh.listRepos(), settings.allClones()])
      return Promise.all(repos.map(async (r) => {
        const p = clones[`${r.owner}/${r.name}`.toLowerCase()]
        return { ...r, clonePath: p && (await isDir(p)) ? p : null }
      }))
    },
    githubGetRepo: async (owner, name) => { await vault.load(); return withClone(await gh.getRepo(owner, name)) },
    githubAvatar: async (url) => {
      if (avatars.has(url)) return avatars.get(url) ?? null
      const data = await fetchAvatar(fetchImpl, url)
      if (avatars.size > 500) avatars.clear()
      avatars.set(url, data)
      return data
    },

    getClonePath: async (owner, name) => {
      assertRepoId(owner, name)
      const p = await settings.getClone(owner, name)
      return p && (await isDir(p)) ? p : null
    },
    linkClone: async (owner, name) => {
      assertRepoId(owner, name)
      const r = await dialog.showOpenDialog({ title: `Choose your local clone of ${owner}/${name}`, properties: ['openDirectory'] })
      if (r.canceled) return null
      const info: RepoInfo = await git.openRepo(r.filePaths[0])
      const rem = info.githubRemote
      if (!rem || rem.owner.toLowerCase() !== owner.toLowerCase() || rem.name.toLowerCase() !== name.toLowerCase())
        throw new Error(`That folder's remotes do not point at github.com/${owner}/${name}`)
      openedRepos.add(info.path)
      await settings.setClone(owner, name, info.path)
      return info
    },
    getRepoPrefs: async (repo) => ({ localOnly: await settings.isLocalOnly(guard(repo)) }),
    setRepoLocalOnly: (repo, on) => settings.setLocalOnly(guard(repo), !!on),

    issuesList: async (t, o) => { await vault.load(); return issues.list(t, o) },
    issuesGet: async (t, n) => { await vault.load(); return issues.get(t, n) },
    issuesCreate: async (t, i) => { await vault.load(); return issues.create(t, i) },
    issuesUpdate: async (t, n, p) => { await vault.load(); return issues.update(t, n, p) },
    issuesComment: async (t, n, b) => { await vault.load(); return issues.comment(t, n, b) },
    labelsList: async (t) => { await vault.load(); return issues.labels(t) },
    labelsCreate: async (t, i) => { await vault.load(); return issues.createLabel(t, i) }
  }

  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(name, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
  }
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

