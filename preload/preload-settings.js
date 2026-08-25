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
  openFile: () => ipcRenderer.invoke('logs:open-file'),
  tail: (maxChars) => ipcRenderer.invoke('logs:tail', maxChars),
  clear: () => ipcRenderer.invoke('logs:clear'),
})

contextBridge.exposeInMainWorld('envAPI', {
  checkNode: () => ipcRenderer.invoke('env:check-node'),
  checkNpm: () => ipcRenderer.invoke('env:check-npm'),
  checkDsh: () => ipcRenderer.invoke('env:check-dsh'),
  checkPlugin: () => ipcRenderer.invoke('env:check-plugin'),
  updateNpm: () => ipcRenderer.invoke('env:update-npm'),
  updateDsh: () => ipcRenderer.invoke('env:update-dsh'),
  updatePlugin: () => ipcRenderer.invoke('env:update-plugin'),
})

contextBridge.exposeInMainWorld('setupAPI', {
  markDone: () => ipcRenderer.invoke('setup:mark-done'),
})