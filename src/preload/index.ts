import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type RepoApi } from '../shared/api'

const api = Object.fromEntries(CHANNELS.map((c) => [c, (...args: unknown[]) => ipcRenderer.invoke(c, ...args)])) as unknown as RepoApi
contextBridge.exposeInMainWorld('api', api)
