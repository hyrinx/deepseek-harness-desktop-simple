// Preload for settings window — 桥接设置页面与主进程 IPC
// 注意：通道名须与 src/ipc.js 中注册的 handle 一致
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setShortcut: (name, value) => ipcRenderer.invoke('settings:set-shortcut', name, value),
  getAutoStart: () => ipcRenderer.invoke('settings:get-autostart'),
  setAutoStart: (enabled) => ipcRenderer.invoke('settings:set-autostart', enabled),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  closeWindow: () => ipcRenderer.send('close-window'),
})

contextBridge.exposeInMainWorld('logsAPI', {
  getInfo: () => ipcRenderer.invoke('logs:get-info'),
  openFolder: () => ipcRenderer.invoke('logs:open-folder'),
  openFile: (stamp) => ipcRenderer.invoke('logs:open-file', stamp),
  tail: (stamp, maxChars) => ipcRenderer.invoke('logs:tail', stamp, maxChars),
  deleteFile: (stamp) => ipcRenderer.invoke('logs:delete-file', stamp),
})