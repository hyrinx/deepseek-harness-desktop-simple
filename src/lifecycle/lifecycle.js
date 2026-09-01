// ═══════════════════════════════════════════════════════════════
// 生命周期（destroyUI / 退出 / 重启 / 启动入口）
// ═══════════════════════════════════════════════════════════════

const { app, globalShortcut, dialog, session } = require('electron')
const { state, clearRef, logEvent, logWriter, bootMark } = require('../core/state')
const { APP_NAME, APP_USER_MODEL_ID, DEFAULT_SHORTCUT, AUTOSTART_ARG, logDirPath, appRootDir } = require('../core/constants')
const { store } = require('../core/store')
const { applyAutoStart, isLaunchedByAutostart } = require('./autostart')
const { registerIpcHandlers } = require('./ipc')
const { registerGlobalShortcut } = require('./shortcut')
const { openLogFile, openTerminal } = require('../core/utils')

function destroyUI() {
  clearRef('trayMenu')
  clearRef('tray')
}

/**
 * 退出与重启共享 destroyUI + shutdownHost 流程，
 * 但最终动作不同（quit vs relaunch），保持独立以避免分支耦合。
 */
async function requestQuit() {
  if (state.isQuitting) { return }
  state.isQuitting = true
  try { destroyUI() } catch (err) { logEvent('quit.destroyUI.fail', { err }, 'warn') }
  try {
    const { shutdownHost } = require('./host')
    await shutdownHost()
  } catch (err) { logEvent('quit.shutdownHost.fail', { err }, 'warn') }
  logWriter.close()
  app.quit()
}

async function requestRestart() {
  if (state.isQuitting) { return }
  state.isQuitting = true
  const { realExePath, mode } = require('../core/runtime')
  try { destroyUI() } catch (err) { logEvent('restart.destroyUI.fail', { err }, 'warn') }
  try {
    const { shutdownHost } = require('./host')
    await shutdownHost()
  } catch (err) { logEvent('restart.shutdownHost.fail', { err }, 'warn') }

  const cleanArgs = process.argv.slice(1).filter((a) => a !== AUTOSTART_ARG)
  const exe = realExePath()

  app.relaunch({
    args: cleanArgs,
    execPath: exe || undefined,
  })

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

  registerIpcHandlers()
  bootMark('whenReady')

  // Node.js 检测：若不存在全局 Node.js，打开设置页引导用户配置
  try {
    const { checkNode } = require('./env')
    const global = await checkNode()
    if (global.ok) {
      bootMark('nodejs check done (global available)')
    } else {
      bootMark('nodejs check done (not found)')
      // 延迟打开设置页引导用户
      setTimeout(() => {
        try { showSettingsOverlay() } catch (e) {
          logEvent('bootstrap.nodejs-settings-overlay.fail', { err: e }, 'error')
        }
      }, 1000)
    }
  } catch (nodeErr) {
    logEvent('bootstrap.nodejs-check.fail', { err: nodeErr.message }, 'error')
    // 不阻断启动，后续 dsh 启动失败会走现有的 fallback 逻辑
  }

  applyAutoStart(store.get('ui.autoStart', false))
  bootMark('applyAutoStart done')

  const silentLaunch = isLaunchedByAutostart()

  const { createMainWindow, showWindow, navigateMainWindow, showSettingsOverlay } = require('./windows')
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
      // dsh 不存在或启动失败 → 直接打开设置页环境标签页，引导用户检查和安装
      setTimeout(() => {
        try { showSettingsOverlay() } catch (e) {
          logEvent('bootstrap.host-fail.settings-overlay.fail', { err: e }, 'error')
        }
      }, 500)
      return
    }
  }

  const shortcut = store.get('shortcuts.toggleWindow', DEFAULT_SHORTCUT)
  async function startTray() {
    createTrayAndMenu({
      onShowMain: showWindow,
      onSettings: showSettingsOverlay,
      onOpenLogs: openLogFile,
      onOpenTerminal: openTerminal,
      onReload: () => {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.reload()
          state.mainWindow.show()
          state.mainWindow.focus()
        }
      },
      onRestart: requestRestart,
      onQuit: requestQuit,
    })
    registerGlobalShortcut(shortcut)
    bootMark('tray + shortcut ready')
  }

  const hostP = startHost()
  const trayP = startTray()

  await hostP
  if (state.hostOrigin === null) {
    await trayP
    bootMark('bootstrap done')
    return
  }
  if (state.isQuitting) return
  await navigateMainWindow()
  await trayP

  bootMark('bootstrap done')

  setupAutoUpdate()
}

/**
 * 自动更新：安装更新器 + 延迟检查更新（避免阻塞启动）
 */
function setupAutoUpdate() {
  try {
    const { setupUpdater, checkForUpdates, onStartupUpdateAvailable } = require('../update/updater')
    setupUpdater()

    // 启动时发现新版本 → 显示 antd 风格自定义弹窗（不再使用系统原生弹窗）
    onStartupUpdateAvailable((version) => {
      try {
        const { showUpdateDialog } = require('./windows')
        showUpdateDialog(String(version))
      } catch (err) {
        logEvent('updater.startup-dialog.fail', { err: err.message }, 'warn')
      }
    })

    // 仅当 autoCheck 为 true 时才自动检查
    if (store.get('update.autoCheck') !== false) {
      setTimeout(() => {
        checkForUpdates().catch((err) => {
          logEvent('updater.startup-check.fail', { err: err.message }, 'warn')
        })
      }, 5000)
    } else {
      logEvent('updater.auto-check.disabled')
    }
  } catch (err) {
    logEvent('updater.setup.fail', { err: err.message }, 'warn')
  }
}

module.exports = {
  destroyUI, requestQuit, requestRestart, showFatalAndQuit, bootstrap,
}