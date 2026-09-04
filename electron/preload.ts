import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CH, type ShortcutApi } from '@shared/ipc';

/** Wraps a push channel as a subscribe function that returns its unsubscriber. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

const api: ShortcutApi = {
  getSnapshot: () => ipcRenderer.invoke(CH.getSnapshot),

  addShortcut: (draft) => ipcRenderer.invoke(CH.addShortcut, draft),
  updateShortcut: (id, patch) => ipcRenderer.invoke(CH.updateShortcut, id, patch),
  deleteShortcut: (id) => ipcRenderer.invoke(CH.deleteShortcut, id),

  setSettings: (patch) => ipcRenderer.invoke(CH.setSettings, patch),
  setEngineEnabled: (enabled) => ipcRenderer.invoke(CH.setEngineEnabled, enabled),

  testAction: (action) => ipcRenderer.invoke(CH.testAction, action),

  startCapture: (mode, stage) => ipcRenderer.invoke(CH.startCapture, mode, stage),
  commitCapture: () => ipcRenderer.invoke(CH.commitCapture),
  cancelCapture: () => ipcRenderer.invoke(CH.cancelCapture),

  pickExecutable: () => ipcRenderer.invoke(CH.pickExecutable),
  pickPath: () => ipcRenderer.invoke(CH.pickPath),
  exportShortcuts: () => ipcRenderer.invoke(CH.exportShortcuts),
  importShortcuts: () => ipcRenderer.invoke(CH.importShortcuts),
  revealStore: () => ipcRenderer.invoke(CH.revealStore),

  minimizeWindow: () => ipcRenderer.invoke(CH.minimizeWindow),
  toggleMaximize: () => ipcRenderer.invoke(CH.toggleMaximize),
  hideWindow: () => ipcRenderer.invoke(CH.hideWindow),
  quitApp: () => ipcRenderer.invoke(CH.quitApp),

  onShortcuts: (cb) => subscribe(CH.pushShortcuts, cb),
  onSettings: (cb) => subscribe(CH.pushSettings, cb),
  onStatus: (cb) => subscribe(CH.pushStatus, cb),
  onInput: (cb) => subscribe(CH.pushInput, cb),
  onFire: (cb) => subscribe(CH.pushFire, cb),
  onCaptureProgress: (cb) => subscribe(CH.pushCaptureProgress, cb),
  onCaptureResult: (cb) => subscribe(CH.pushCaptureResult, cb),
};

contextBridge.exposeInMainWorld('shortcut', api);
