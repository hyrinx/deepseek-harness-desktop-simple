// ═══════════════════════════════════════════════════════════════
// 生命周期（destroyUI / 退出 / 重启 / 启动入口）
// ═══════════════════════════════════════════════════════════════

const { app, globalShortcut, dialog, session, shell } = require('electron')
const { join } = require('node:path')
const fs = require('node:fs')
const { state, clearRef, logEvent, logWriter, bootMark } = require('./state')
const { APP_NAME, APP_USER_MODEL_ID, DEFAULT_SHORTCUT, AUTOSTART_ARG, todayStamp, logDirPath, appRootDir } = require('./constants')
const { store } = require('./store')
const { applyAutoStart, isLaunchedByAutostart } = require('./autostart')
const { registerIpcHandlers, registerGlobalShortcut } = require('./ipc')

function destroyUI() {
  logEvent('ui.destroy.start', {
    hasTray: Boolean(state.tray),
    hasTrayMenu: Boolean(state.trayMenu),
    hasSettingsWindow: Boolean(state.settingsWindow),
  })
  clearRef('trayMenu')  // 先销毁 menubar（内部会销毁 mb.tray）
  clearRef('tray')      // 再销毁 Electron Tray（兜底，mb.tray 可能已被 trayMenu 销毁）
  if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
    try { state.settingsWindow.destroy() } catch (err) { logEvent('ui.destroy.settings-window.fail', { err }, 'warn') }
    state.settingsWindow = null
  }
  logEvent('ui.destroy.done')
}

/**
 * 退出与重启共享 destroyUI + shutdownHost 流程，
 * 但最终动作不同（quit vs relaunch），保持独立以避免分支耦合。
 */
async function requestQuit() {
  if (state.isQuitting) { logEvent('quit.request.duplicate'); return }
  state.isQuitting = true
  const t0 = Date.now()
  logEvent('quit.request', { cause: 'requestQuit' })
  try { destroyUI() } catch (err) { logEvent('quit.destroyUI.fail', { err }, 'warn') }
  try {
    const { shutdownHost } = require('./host')
    await shutdownHost()
  } catch (err) { logEvent('quit.shutdownHost.fail', { err }, 'warn') }
  logEvent('quit.app.quit', { tookMs: Date.now() - t0 })
  logWriter.close()
  app.quit()
}

async function requestRestart() {
  if (state.isQuitting) { logEvent('restart.request.duplicate'); return }
  state.isQuitting = true
  const t0 = Date.now()
  logEvent('restart.request', { cause: 'requestRestart', argv: process.argv })
  try { destroyUI() } catch (err) { logEvent('restart.destroyUI.fail', { err }, 'warn') }
  try {
    const { shutdownHost } = require('./host')
    await shutdownHost()
  } catch (err) { logEvent('restart.shutdownHost.fail', { err }, 'warn') }
  const cleanArgs = process.argv.slice(1).filter((a) => a !== AUTOSTART_ARG)
  app.relaunch({ args: cleanArgs })
  logEvent('restart.app.quit', { tookMs: Date.now() - t0, cleanArgs })
  logWriter.close()
  app.quit()
}

async function showFatalAndQuit(error) {
  console.error('[bootstrap] 启动失败：', error)
  logEvent('bootstrap.fatal', { err: error }, 'error')
  try {
    await dialog.showMessageBox({
      type: 'error',
      title: `${APP_NAME} 启动失败`,
      message: error instanceof Error ? error.message : String(error),
    })
  } catch (dialogErr) {
    logEvent('bootstrap.fatal.dialog.fail', { err: dialogErr }, 'error')
  }
  await requestQuit()
}

async function openTodayLog() {
  const safeStamp = todayStamp()
  const target = join(logDirPath(), `host-${safeStamp}.log`)
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(logDirPath(), { recursive: true })
      fs.writeFileSync(target, `# host-${safeStamp}.log — 暂无输出\n# 日志目录：${logDirPath()}\n`, 'utf-8')
    }
  } catch (err) {
    console.error('[logs] touch today 失败：', err)
    logEvent('logs.touch-today.fail', { stamp: safeStamp, target, err }, 'error')
  }
  const result = await shell.openPath(target)
  if (result) logEvent('logs.open-today.fail', { stamp: safeStamp, target, error: result }, 'error')
  else logEvent('logs.open-today.ok', { stamp: safeStamp, target })
}

async function bootstrap() {
  const t0 = Date.now()
  logEvent('bootstrap.start', {
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    logsDir: logDirPath(),
    appRootDir: appRootDir(),
    userDataDir: app.getPath('userData'),
  })

  app.setAppUserModelId(APP_USER_MODEL_ID)
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  logEvent('bootstrap.hardenSession.done', { tookMs: Date.now() - t0 })

  registerIpcHandlers()
  bootMark('whenReady')

  applyAutoStart(store.get('ui.autoStart', false))
  bootMark('applyAutoStart done')

  const silentLaunch = isLaunchedByAutostart()
  logEvent('bootstrap.silentLaunch', { silentLaunch })

  const { createMainWindow, showWindow, navigateMainWindow, createSettingsWindow } = require('./windows')
  const { createTrayAndMenu } = require('./tray')
  const { spawnDshWeb, waitForHostReady } = require('./host')

  createMainWindow({ silent: silentLaunch })

  async function startHost() {
    try {
      state.host = spawnDshWeb()
      const t = Date.now()
      state.hostOrigin = await waitForHostReady(state.host)
      logEvent('bootstrap.host.ready', { tookMs: Date.now() - t, origin: state.hostOrigin })
    } catch (err) {
      logEvent('bootstrap.host.fail', { message: err.message }, 'error')
      state.hostOrigin = null
      // dsh 不存在或启动失败 → 弹窗提示用户自行安装
      await dialog.showMessageBox({
        type: 'error',
        title: `${APP_NAME} 启动失败`,
        message: '未找到 DeepSeek Harness CLI（dsh），请先安装 Node.js 和 dsh 后再启动。',
        detail: '安装指南：npm install -g dsh\n\n' + (err.message || ''),
        buttons: ['退出'],
      })
      await requestQuit()
      return
    }
  }

  const shortcut = store.get('shortcuts.toggleWindow', DEFAULT_SHORTCUT)
  async function startTray() {
    logEvent('bootstrap.trayMenu.create.start')
    createTrayAndMenu({
      onShowMain: showWindow,
      onSettings: createSettingsWindow,
      onOpenLogs: openTodayLog,
      onRestart: requestRestart,
      onQuit: requestQuit,
    }, logEvent)
    logEvent('bootstrap.trayMenu.create.ok')
    registerGlobalShortcut(shortcut)
    bootMark('tray + shortcut ready')
  }

  const hostP = startHost()
  const trayP = startTray()

  await hostP
  if (state.isQuitting) return
  await navigateMainWindow()
  await trayP
  const totalTook = bootMark('bootstrap done')
  logEvent('bootstrap.done', { tookMs: totalTook, uptimeSec: Math.round(process.uptime() * 1000) / 1000 })
}

module.exports = {
  destroyUI, requestQuit, requestRestart, showFatalAndQuit, bootstrap,
}