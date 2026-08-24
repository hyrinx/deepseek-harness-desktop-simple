// Preload for tray menu window — minimal IPC exposure
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  ipc: {
    send(channel, ...args) {
      const allowed = ['show-window', 'toggle-window', 'open-settings',
                       'open-log-dir', 'quit-app', 'restart-app',
                       'tray-menu-select']
      if (allowed.includes(channel)) ipcRenderer.send(channel, ...args)
    },
  },
})