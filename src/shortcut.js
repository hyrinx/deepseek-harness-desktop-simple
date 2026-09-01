// ═══════════════════════════════════════════════════════════════
// 全局快捷键管理（主进程）
// ═══════════════════════════════════════════════════════════════

const { logEvent } = require('./state')

// 渲染进程可写入的快捷键键名白名单（防原型污染 / 越权写入 store 任意路径）
const SHORTCUT_KEYS = new Set(['toggleWindow'])

function registerGlobalShortcut(accelerator) {
  const { globalShortcut } = require('electron')
  try {
    globalShortcut.unregisterAll()
    if (!accelerator) {
      return
    }
    const ok = globalShortcut.register(accelerator, () => {
      try {
        const { toggleWindow } = require('./windows')
        toggleWindow()
      } catch (err) { logEvent('shortcut.triggered.toggleWindow.fail', { err }, 'error') }
    })
    if (!ok) {
      logEvent('shortcut.register.fail', { accelerator, reason: 'globalShortcut.register returned false' }, 'warn')
    }
  } catch (err) {
    logEvent('shortcut.register.error', { accelerator, err }, 'error')
  }
}

module.exports = { SHORTCUT_KEYS, registerGlobalShortcut }