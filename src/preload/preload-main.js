// 主窗口 preload：暴露窗口拖拽 API + 设置覆盖层 API 给渲染进程
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('windowDrag', {
  start: (screenX, screenY) => {
    ipcRenderer.send('window-drag-start', screenX, screenY)
  },
  move: (screenX, screenY) => {
    ipcRenderer.send('window-drag-move', screenX, screenY)
  },
  end: () => {
    ipcRenderer.send('window-drag-end')
  },
  toggleMaximize: () => {
    ipcRenderer.invoke('window-toggle-maximize')
  }
})

// 设置覆盖层 API（原 preload-settings.js 的内容迁移至此）
contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setShortcut: (name, value) => ipcRenderer.invoke('settings:set-shortcut', name, value),
  getAutoStart: () => ipcRenderer.invoke('settings:get-autostart'),
  setAutoStart: (enabled) => ipcRenderer.invoke('settings:set-autostart', enabled),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getVersion: () => ipcRenderer.invoke('get-version'),
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

contextBridge.exposeInMainWorld('settingsOverlay', {
  show: () => ipcRenderer.invoke('settings:show-overlay'),
  hide: () => ipcRenderer.invoke('settings:hide-overlay'),
})