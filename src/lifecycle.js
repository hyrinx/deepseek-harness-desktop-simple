// ═══════════════════════════════════════════════════════════════
// 生命周期（destroyUI / 退出 / 重启 / 启动入口）
// ═══════════════════════════════════════════════════════════════

const { app, globalShortcut, dialog, session, shell } = require('electron')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { state, clearRef, logEvent, logWriter, bootMark } = require('./state')
const { APP_NAME, APP_USER_MODEL_ID, DEFAULT_SHORTCUT, AUTOSTART_ARG, logDirPath, logFilePath, appRootDir, configFilePath, IS_WIN, IS_MAC } = require('./constants')
const { store } = require('./store')
const { applyAutoStart, isLaunchedByAutostart } = require('./autostart')
const { registerIpcHandlers, registerGlobalShortcut } = require('./ipc')

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

async function openLogFile() {
  const target = logFilePath()
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(logDirPath(), { recursive: true })
      fs.writeFileSync(target, '', 'utf-8')
    }
  } catch (err) {
    console.error('[logs] touch log file 失败：', err)
    logEvent('logs.touch-log.fail', { target, err }, 'error')
  }
  const result = await shell.openPath(target)
  if (result) logEvent('logs.open-log.fail', { target, error: result }, 'error')
  else logEvent('logs.open-log.ok', { target })
}

async function openTerminal() {
  logEvent('terminal.open')
  try {
    if (IS_WIN) {
      const { join, dirname } = require('node:path')
      const histFile = join(dirname(configFilePath()), 'cmd_history.txt')
      const ps1Path = join(dirname(configFilePath()), 'open_terminal.ps1')
      const ps1 = [
        `$histFile = '${histFile.replace(/'/g, "''")}'`,
        `try { Set-PSReadLineOption -HistorySavePath $histFile -ErrorAction Stop } catch {}`,
        `Write-Host '  ══════════════════════════════════════'`,
        `Write-Host '  常用命令'`,
        `Write-Host '  ══════════════════════════════════════'`,
        `Write-Host '  dsh plugin --profile web add <name>      安装插件'`,
        `Write-Host '  dsh plugin --profile web remove <name>   删除插件'`,
        `Write-Host '  dsh plugin --profile web list              查看插件列表'`,
        `Write-Host '  npm install -g @deepseek-ai/dsh@latest     更新 dsh'`,
        `Write-Host ''`,
        `Write-Host '  (按↑浏览历史命令，自动保存)'`,
        `Write-Host ''`,
      ].join('\n')
      fs.writeFileSync(ps1Path, '\uFEFF' + ps1, 'utf-8')  // UTF-8 BOM，解决中文乱码
      spawn(`start "dsh" powershell -NoExit -ExecutionPolicy Bypass -File "${ps1Path}"`, [], {
        shell: true, detached: true, windowsHide: false,
      })
    } else {
      const { join, dirname } = require('node:path')
      const shPath = join(dirname(configFilePath()), IS_MAC ? 'open_terminal.command' : 'open_terminal.sh')
      const sh = [
        '#!/bin/bash',
        'cat << \'EOF\'',
        '  ═══════════════════════════════════════',
        '  常用命令',
        '  ═══════════════════════════════════════════',
        '  dsh plugin --profile web add <name>      安装插件',
        '  dsh plugin --profile web remove <name>   删除插件',
        '  dsh plugin --profile web list              查看插件列表',
        '  npm install -g @deepseek-ai/dsh@latest     更新 dsh',
        '',
        '  (按↑浏览历史命令，自动保存)',
        '',
        'EOF',
        'exec $SHELL',
      ].join('\n')
      fs.writeFileSync(shPath, sh, 'utf-8')
      fs.chmodSync(shPath, 0o755)
      if (IS_MAC) {
        spawn('open', ['-a', 'Terminal', shPath], { detached: true })
      } else {
        spawn('x-terminal-emulator', ['-e', shPath], { detached: true })
      }
    }
    logEvent('terminal.open.ok')
  } catch (err) {
    logEvent('terminal.open.fail', { err }, 'error')
  }
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
      onSettings: showSettingsOverlay,
      onOpenLogs: openLogFile,
      onOpenTerminal: openTerminal,
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
  if (state.isQuitting) return
  await navigateMainWindow()
  await trayP

  // 首次启动：自动弹出设置覆盖层，引导用户检查系统环境
  if (!store.get('ui.setupDone', false)) {
    logEvent('bootstrap.first-launch.setup-open')
    setTimeout(() => {
      try { showSettingsOverlay() } catch (e) {
        logEvent('bootstrap.first-launch.settings-overlay.fail', { err: e }, 'error')
      }
    }, 800)
  }

  const totalTook = bootMark('bootstrap done')
  logEvent('bootstrap.done', { tookMs: totalTook, uptimeSec: Math.round(process.uptime() * 1000) / 1000 })
}

module.exports = {
  destroyUI, requestQuit, requestRestart, showFatalAndQuit, bootstrap,
}