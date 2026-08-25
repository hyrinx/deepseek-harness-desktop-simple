// 主窗口 preload：暴露窗口拖拽 API 给渲染进程
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