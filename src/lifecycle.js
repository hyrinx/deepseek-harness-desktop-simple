// ═══════════════════════════════════════════════════════════════
// 生命周期（destroyUI / 退出 / 重启 / 启动入口）
// ═══════════════════════════════════════════════════════════════

const { app, globalShortcut, dialog, session } = require('electron')
const { state, clearRef, logEvent, logWriter, bootMark } = require('./state')
const { APP_NAME, APP_USER_MODEL_ID, DEFAULT_SHORTCUT, AUTOSTART_ARG, logDirPath, appRootDir } = require('./constants')
const { store } = require('./store')
const { applyAutoStart, isLaunchedByAutostart } = require('./autostart')
const { registerIpcHandlers } = require('./ipc')
const { registerGlobalShortcut } = require('./shortcut')
const { openLogFile, openTerminal } = require('./utils')

function destroyUI() {
  logEvent('ui.destroy.start', {
    hasTray: Boolean(state.tray),
    hasTrayMenu: Boolean(state.trayMenu),
  })
  clearRef('trayMenu')  // 先销毁菜单窗口（内部会销毁 tray）
  clearRef('tray')      // 再销毁 Electron Tray（兜底，tray 可能已被 trayMenu 销毁）
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
  const { realExePath, mode } = require('./env')
  logEvent('restart.request', {
    cause: 'requestRestart',
    mode: mode(),
    argv: process.argv,
    execPath: process.execPath,
    realExePath: realExePath(),
    isPackaged: app.isPackaged,
    cwd: process.cwd(),
  })
  try { destroyUI() } catch (err) { logEvent('restart.destroyUI.fail', { err }, 'warn') }
  try {
    const { shutdownHost } = require('./host')
    await shutdownHost()
  } catch (err) { logEvent('restart.shutdownHost.fail', { err }, 'warn') }

  const cleanArgs = process.argv.slice(1).filter((a) => a !== AUTOSTART_ARG)
  const exe = realExePath()

  // 三种模式统一走 app.relaunch：
  // 便携版通过 execPath 覆盖指向真实 exe（PORTABLE_EXECUTABLE_FILE，
  // 含版本号文件名），绕开 %TEMP% 临时目录和内层 exe 名不匹配的问题。
  // dev 模式 exe 为 null → 用默认 process.execPath（electron.exe）。
  logEvent('restart.relaunch', { cleanArgs, execPath: exe || '(default)', mode: mode() })
  app.relaunch({
    args: cleanArgs,
    execPath: exe || undefined,
  })

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

  // Node.js 检测：若不存在全局 Node.js，打开设置页引导用户配置
  try {
    const { checkGlobalNode } = require('./nodejs-bootstrap')
    const global = await checkGlobalNode()
    if (global.available) {
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
  logEvent('bootstrap.silentLaunch', { silentLaunch })

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
    logEvent('bootstrap.trayMenu.create.start')
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
    logEvent('bootstrap.trayMenu.create.ok')
    registerGlobalShortcut(shortcut)
    bootMark('tray + shortcut ready')
  }

  const hostP = startHost()
  const trayP = startTray()

  await hostP
  if (state.hostOrigin === null) {
    // dsh 启动失败，设置覆盖层已打开，跳过导航但保留托盘供用户重启
    logEvent('bootstrap.host-fail.no-host')
    await trayP
    const totalTook = bootMark('bootstrap done')
    logEvent('bootstrap.done.no-host', { tookMs: totalTook })
    return
  }
  if (state.isQuitting) return
  await navigateMainWindow()
  await trayP

  const totalTook = bootMark('bootstrap done')
  logEvent('bootstrap.done', { tookMs: totalTook, uptimeSec: Math.round(process.uptime() * 1000) / 1000 })

  setupAutoUpdate()
}

/**
 * 自动更新：安装更新器 + 延迟检查更新（避免阻塞启动）
 */
function setupAutoUpdate() {
  try {
    const { setupUpdater, checkForUpdates, downloadUpdate, onStartupUpdateAvailable } = require('./updater')
    setupUpdater()

    // 启动时发现新版本 → 弹窗询问用户
    onStartupUpdateAvailable((version) => {
      const { dialog } = require('electron')
      dialog.showMessageBox({
        type: 'info',
        title: '发现新版本',
        message: `发现新版本 v${version}`,
        detail: '下载完成后可在设置页「关于」标签中安装。',
        buttons: ['立即下载', '跳过此版本', '不再提醒'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) {
          downloadUpdate().catch((err) => {
            logEvent('updater.startup-download.fail', { err: err.message }, 'warn')
          })
        } else if (response === 1) {
          // 跳过此版本：记录版本号，下次不同版本再提醒
          store.set('update.skippedVersion', version)
          logEvent('updater.skip-version', { version })
        } else if (response === 2) {
          // 不再提醒：关闭自动检查
          store.set('update.autoCheck', false)
          logEvent('updater.disable-auto-check')
        }
      })
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