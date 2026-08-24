// ═══════════════════════════════════════════════════════════════
// 开机自启（Windows 注册表 / macOS LoginItem）
// ═══════════════════════════════════════════════════════════════

const { app } = require('electron')
const { store } = require('./store')
const { logEvent } = require('./state')
const { AUTOSTART_ARG } = require('./constants')

function applyAutoStart(enabled) {
  try {
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        args: [AUTOSTART_ARG],
      })
    } else {
      app.setLoginItemSettings({ openAtLogin: false })
    }
    logEvent('autostart.apply', {
      requested: enabled,
      effective: app.getLoginItemSettings().openAtLogin,
      isPackaged: app.isPackaged,
    })
  } catch (err) {
    logEvent('autostart.apply.fail', { err }, 'error')
  }
}

function isLaunchedByAutostart() {
  return Boolean(
    app.getLoginItemSettings().wasOpenedAtLogin ||
    process.argv.includes(AUTOSTART_ARG),
  )
}

module.exports = { applyAutoStart, isLaunchedByAutostart }