// ═══════════════════════════════════════════════════════════════
// 开机自启（Windows 注册表 / macOS LoginItem）
// ═══════════════════════════════════════════════════════════════

const { app } = require('electron')
const { store } = require('./store')
const { logEvent } = require('./state')
const { AUTOSTART_ARG } = require('./constants')

function applyAutoStart(enabled) {
  try {
    const { realExePath } = require('./runtime')
    const exe = realExePath()
    app.setLoginItemSettings({
      openAtLogin: app.isPackaged && enabled,
      path: exe || undefined,
      args: [AUTOSTART_ARG],
    })
    const settings = app.getLoginItemSettings()
    logEvent('autostart.apply', {
      requested: enabled,
      effective: settings.openAtLogin,
      isPackaged: app.isPackaged,
    })
    return {
      enabled: settings.openAtLogin,
      available: app.isPackaged,
      actuallySet: settings.openAtLogin,
    }
  } catch (err) {
    logEvent('autostart.apply.fail', { err }, 'error')
    return {
      enabled: false,
      available: app.isPackaged,
      actuallySet: false,
    }
  }
}

function isLaunchedByAutostart() {
  return Boolean(
    app.getLoginItemSettings().wasOpenedAtLogin ||
    process.argv.includes(AUTOSTART_ARG),
  )
}

module.exports = { applyAutoStart, isLaunchedByAutostart }