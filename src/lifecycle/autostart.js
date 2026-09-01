// ═══════════════════════════════════════════════════════════════
// 开机自启（Windows Run 注册表 / macOS LoginItem）
//
// 写入/删除：纯 Electron 原生 API（app.setLoginItemSettings）
// 读取：getLoginItemSettings 在「路径含空格」时读回恒为 false
//       （Electron 已知缺陷 #31710，官方不修复），故 Windows 用 reg query 校验
// 便携版须传真实双击路径 realExePath()，避免写入 %TEMP% 临时目录
// path/args 仅 Windows 有效，macOS 走原生 getLoginItemSettings
// ═══════════════════════════════════════════════════════════════

const { app } = require('electron')
const { execSync } = require('node:child_process')
const { logEvent } = require('../core/state')
const { AUTOSTART_ARG, IS_WIN } = require('../core/constants')
const { realExePath } = require('../core/runtime')

// 仅 Windows：让 set/get 传入一致的值名 + path + args
// name(值名)必须显式传：Electron 在 Windows 删除自启项时，只有显式传入 name
// 才会删掉对应的 Run 注册表值；不传 name 时删除会静默失效，导致「关闭失败、重启仍自启」。
// 值名统一用 app.name（默认写入值名即 app.name），path 用真实双击路径，args 用自启参数。
function loginOptions() {
  if (IS_WIN) {
    return { name: app.name, path: realExePath() || process.execPath, args: [AUTOSTART_ARG] }
  }
  return {}
}

function readAutoStart() {
  try {
    if (IS_WIN) {
      // 整键读取 Run 键，避免 Electron 因键名/内部比对导致的读回 false
      const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`
      const raw = execSync(`chcp 65001 > nul && reg query "${key}"`, {
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 5000,
      })
      const exePath = realExePath() || process.execPath
      const enabled = raw.includes(exePath)
      return { enabled, available: app.isPackaged, actuallySet: enabled }
    }

    // macOS：原生 API
    const settings = app.getLoginItemSettings()
    return {
      enabled: settings.openAtLogin,
      available: app.isPackaged,
      actuallySet: settings.openAtLogin,
    }
  } catch (err) {
    logEvent('autostart.read.fail', { err: String(err) }, 'error')
    return { enabled: false, available: app.isPackaged, actuallySet: false }
  }
}

function applyAutoStart(enabled) {
  try {
    const setOpts = {
      openAtLogin: app.isPackaged && enabled,
      ...loginOptions(),
    }

    app.setLoginItemSettings(setOpts)

    let result = readAutoStart()

    // 失败兜底：写入未生效时强制清掉自启项，
    if (result.actuallySet !== enabled) {
      app.setLoginItemSettings({ openAtLogin: false, ...loginOptions() })
      result = readAutoStart()
    }

    return result
  } catch (err) {
    logEvent('autostart.apply.fail', { err: String(err) }, 'error')
    return { enabled: false, available: app.isPackaged, actuallySet: false }
  }
}

function isLaunchedByAutostart() {
  return Boolean(
    app.getLoginItemSettings(loginOptions()).wasOpenedAtLogin ||
    process.argv.includes(AUTOSTART_ARG),
  )
}

module.exports = { applyAutoStart, readAutoStart, isLaunchedByAutostart }