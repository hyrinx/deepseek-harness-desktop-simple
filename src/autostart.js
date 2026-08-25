// ═══════════════════════════════════════════════════════════════
// 开机自启（Windows 注册表 / macOS LoginItem）
// ═══════════════════════════════════════════════════════════════

const { app } = require('electron')
const { store } = require('./store')
const { logEvent } = require('./state')
const { AUTOSTART_ARG } = require('./constants')

// 只读查询当前登录项状态（无任何写副作用），供 UI 刷新展示
function readAutoStart() {
  try {
    const settings = app.getLoginItemSettings()
    return {
      enabled: settings.openAtLogin,
      available: app.isPackaged,
      actuallySet: settings.openAtLogin,
    }
  } catch (err) {
    logEvent('autostart.read.fail', { err }, 'error')
    return { enabled: false, available: app.isPackaged, actuallySet: false }
  }
}

function applyAutoStart(enabled) {
  try {
    const { realExePath } = require('./env')
    const exe = realExePath()
    app.setLoginItemSettings({
      openAtLogin: app.isPackaged && enabled,
      path: exe || undefined,
      args: [AUTOSTART_ARG],
    })
    const result = readAutoStart()
    logEvent('autostart.apply', {
      requested: enabled,
      isPackaged: app.isPackaged,
      effective: result.enabled,
    })
    return result
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

module.exports = { applyAutoStart, readAutoStart, isLaunchedByAutostart }