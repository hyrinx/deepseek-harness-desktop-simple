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

// 自绘窗口控制按钮（─ □ ✕）API
contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => {
    ipcRenderer.send('window-minimize')
  },
  toggleMaximize: () => {
    ipcRenderer.invoke('window-toggle-maximize')
  },
  close: () => {
    ipcRenderer.send('close-window')
  },
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (callback) => {
    const handler = (_event, isMaximized) => callback(isMaximized)
    ipcRenderer.on('window-maximize-change', handler)
    return () => ipcRenderer.removeListener('window-maximize-change', handler)
  }
})

// 设置覆盖层 API
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
  checkPnpm: () => ipcRenderer.invoke('env:check-pnpm'),
  checkDsh: () => ipcRenderer.invoke('env:check-dsh'),
  checkPlugin: () => ipcRenderer.invoke('env:check-plugin'),
  updateNpm: () => ipcRenderer.invoke('env:update-npm'),
  updatePnpm: () => ipcRenderer.invoke('env:update-pnpm'),
  updateDsh: () => ipcRenderer.invoke('env:update-dsh'),
  updatePlugin: () => ipcRenderer.invoke('env:update-plugin'),
  onProgress: (callback) => {
    const handler = (_, text) => callback(text)
    ipcRenderer.on('env:progress', handler)
    return () => ipcRenderer.removeListener('env:progress', handler)
  },
})

contextBridge.exposeInMainWorld('setupAPI', {
  markDone: () => ipcRenderer.invoke('setup:mark-done'),
})

contextBridge.exposeInMainWorld('settingsOverlay', {
  show: () => ipcRenderer.invoke('settings:show-overlay'),
  hide: () => ipcRenderer.invoke('settings:hide-overlay'),
})

contextBridge.exposeInMainWorld('appAPI', {
  restartDsh: () => ipcRenderer.invoke('app:restart-dsh'),
})

contextBridge.exposeInMainWorld('updateAPI', {
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  getState: () => ipcRenderer.invoke('update:get-state'),
  getMirror: () => ipcRenderer.invoke('update:get-mirror'),
  setMirror: (mirror) => ipcRenderer.invoke('update:set-mirror', mirror),
  getAutoCheck: () => ipcRenderer.invoke('update:get-auto-check'),
  setAutoCheck: (enabled) => ipcRenderer.invoke('update:set-auto-check', enabled),
  getSkippedVersion: () => ipcRenderer.invoke('update:get-skipped-version'),
})