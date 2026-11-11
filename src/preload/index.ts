import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, UPDATE_STATE_EVENT, type RepoApi, type RepoEvents } from '../shared/api'
import type { UpdateState } from '../shared/types'

const invokes = Object.fromEntries(CHANNELS.map((c) => [c, (...args: unknown[]) => ipcRenderer.invoke(c, ...args)])) as unknown as RepoApi
const events: RepoEvents = {
  onUpdateState: (cb) => {
    const l = (_e: unknown, s: UpdateState): void => cb(s)
    ipcRenderer.on(UPDATE_STATE_EVENT, l)
    return () => { ipcRenderer.removeListener(UPDATE_STATE_EVENT, l) }
  }
}
contextBridge.exposeInMainWorld('api', { ...invokes, ...events })
