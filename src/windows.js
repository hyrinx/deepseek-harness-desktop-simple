// ═══════════════════════════════════════════════════════════════
// 主窗口 + 设置窗口（创建 / 导航 / CSS 注入 / 显示切换）
// ═══════════════════════════════════════════════════════════════

const { join } = require('node:path')
const { BrowserWindow, shell } = require('electron')
const { state, logEvent, bootMark } = require('./state')
const {
  APP_NAME, ICON_PATH, SETTINGS_HTML, PRELOAD_SETTINGS,
  MAIN_WIN, SETTINGS_WIN, IS_WIN, IS_MAC, IS_LINUX,
  INJECT_DRAG_SCRIPT, INJECT_SESSION_HEADER_CSS, LOADING_HTML,
} = require('./constants')

const PRELOAD_MAIN = join(__dirname, '..', 'preload', 'preload-main.js')

// ── 主窗口 ──

function isExternalUrl(raw) {
  try {
    const { protocol } = new URL(raw)
    return protocol === 'http:' || protocol === 'https:'
  } catch { return false }
}

function sameOrigin(raw, expected) {
  try { return new URL(raw).origin === expected } catch { return false }
}

/**
 * 主窗口选项：悬浮标题栏（隐藏系统标题栏 + titleBarOverlay 窗口控制按钮）。
 *
 * 拖拽机制说明（重要）：不用系统原生标题栏；拖拽也不调用 win.setPosition——
 * Electron 在 Windows 下存在核心 bug（#48247 / #9477）：仅设置位置时会把窗口
 * 宽高一并篡改（非 100% DPI 缩放下逐次放大）。官方确认的绕法是改用
 * setBounds 显式携带宽高（见 ipc.js window-drag-move），宽高取自拖拽开始时的
 * 尺寸并在拖拽期间钉住，尺寸永不漂移。
 */
function buildMainWindowOptions() {
  const base = {
    ...MAIN_WIN,
    show: false,
    frame: IS_WIN || IS_LINUX,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    title: APP_NAME,
    icon: ICON_PATH,
    webPreferences: {
      preload: PRELOAD_MAIN,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  }
  if (!IS_MAC) {
    base.titleBarOverlay = {
      color: '#00000000',
      symbolColor: '#7f858f',
      height: 44,
    }
  }
  if (IS_MAC) {
    base.trafficLightPosition = { x: 16, y: 18 }
    base.vibrancy = 'sidebar'
    base.visualEffectState = 'followWindow'
  }
  if (IS_WIN) {
    base.backgroundMaterial = 'acrylic'
    base.hasShadow = true
    base.roundedCorners = true
    base.thickFrame = true
  } else {
    base.transparent = true
    base.backgroundColor = '#00000000'
  }
  return base
}

function injectMainWindowCSS(win) {
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(INJECT_DRAG_SCRIPT).catch(() => {})
    if (IS_WIN) win.webContents.insertCSS(INJECT_SESSION_HEADER_CSS).catch(() => {})
  })
}

function bindMainWindowNavigation(win, origin) {
  win.webContents.on('will-navigate', (event, url) => {
    if (sameOrigin(url, origin)) return
    event.preventDefault()
    if (isExternalUrl(url)) shell.openExternal(url)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
}

function bindMainWindowLifecycle(win) {
  const id = win.id
  win.on('show', () => logEvent('main-window.show', { id }))
  win.on('hide', () => logEvent('main-window.hide', { id }))
  win.on('minimize', () => logEvent('main-window.minimize', { id }))
  win.on('restore', () => logEvent('main-window.restore', { id }))
  win.on('focus', () => logEvent('main-window.focus', { id }))
  win.on('blur', () => logEvent('main-window.blur', { id }))
  win.on('close', (event) => {
    if (!state.isQuitting) {
      logEvent('main-window.close.prevent-hide', { id })
      event.preventDefault()
      win.hide()
    } else {
      logEvent('main-window.close.allow-quit', { id })
    }
  })
  win.on('closed', () => {
    logEvent('main-window.closed', { id })
    if (state.mainWindow === win) state.mainWindow = null
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    logEvent('main-window.render-process-gone', { id, reason: details.reason, exitCode: details.exitCode }, 'error')
  })
  win.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedUrl, isMainFrame) => {
    if (!isMainFrame) return
    logEvent('main-window.did-fail-load', { id, errorCode, errorDesc, url: validatedUrl }, 'error')
  })
  win.webContents.on('unresponsive', () => {
    logEvent('main-window.unresponsive', { id }, 'warn')
  })
}

function createMainWindow(options = {}) {
  const { silent = false } = options
  logEvent('main-window.create.start', { silent })
  const win = new BrowserWindow(buildMainWindowOptions())
  logEvent('main-window.create.ok', { id: win.id })
  state.mainWindow = win

  bindMainWindowLifecycle(win)

  if (!state.isQuitting && !silent) {
    win.once('ready-to-show', () => {
      win.show()
      bootMark('show window (loading)')
    })
  }

  bootMark('load loading page')
  win.loadURL(LOADING_HTML).catch((err) => {
    logEvent('main-window.load-loading.fail', { id: win.id, err }, 'error')
  })
  return win
}

async function navigateMainWindow() {
  const win = state.mainWindow
  if (!win || win.isDestroyed()) {
    logEvent('main-window.navigate.skip', { reason: win ? 'destroyed' : 'null' }, 'warn')
    return
  }
  const origin = state.hostOrigin
  try {
    if (!origin) {
      logEvent('main-window.navigate.no-host', { id: win.id }, 'warn')
      return
    }

    bindMainWindowNavigation(win, origin)
    injectMainWindowCSS(win)

    const rendererUrl = new URL(origin)
    rendererUrl.searchParams.set('dsh-desktop-platform', process.platform)
    logEvent('main-window.navigate.start', { id: win.id, origin })
    bootMark('navigate to host')
    await win.loadURL(rendererUrl.href)
    logEvent('main-window.navigate.ok', { id: win.id, tookMs: bootMark('loadURL done') })
  } catch (err) {
    logEvent('main-window.navigate.fail', { id: win.id, err }, 'error')
    // 导航失败不抛错，避免启动流程崩溃（用户可通过托盘菜单操作）
  }
}

// ── 设置窗口 ──

function createSettingsWindow() {
  if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
    logEvent('settings-window.focus.existing', { id: state.settingsWindow.id })
    state.settingsWindow.show()
    state.settingsWindow.focus()
    return state.settingsWindow
  }
  logEvent('settings-window.create.start')
  const win = new BrowserWindow({
    ...SETTINGS_WIN,
    show: false,
    autoHideMenuBar: true,
    title: `设置 - ${APP_NAME}`,
    icon: ICON_PATH,
    webPreferences: {
      preload: PRELOAD_SETTINGS,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  logEvent('settings-window.create.ok', { id: win.id })
  state.settingsWindow = win
  win.on('show', () => logEvent('settings-window.show', { id: win.id }))
  win.on('closed', () => {
    logEvent('settings-window.closed', { id: win.id })
    if (state.settingsWindow === win) state.settingsWindow = null
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    logEvent('settings-window.render-process-gone', { id: win.id, reason: details.reason, exitCode: details.exitCode }, 'error')
  })
  win.once('ready-to-show', () => win.show())
  win.loadFile(SETTINGS_HTML).catch((err) => {
    logEvent('settings-window.load.fail', { id: win.id, err }, 'error')
  })
  return win
}

// ── 显示/切换 ──

function showWindow() {
  if (state.isQuitting) {
    logEvent('showWindow.skipped.isQuitting')
    return
  }
  if (!state.mainWindow || state.mainWindow.isDestroyed()) {
    logEvent('showWindow.recreate.mainWindow', { hasHostOrigin: Boolean(state.hostOrigin) })
    if (state.hostOrigin) {
      try { createMainWindow() }
      catch (e) {
        logEvent('showWindow.recreate.fail', { err: e }, 'error')
        console.error('[main] 重建窗口失败：', e)
      }
    }
    return
  }
  if (state.mainWindow.isMinimized()) state.mainWindow.restore()
  state.mainWindow.show()
  state.mainWindow.focus()
}

function toggleWindow() {
  if (state.isQuitting) return
  const w = state.mainWindow
  if (w && !w.isDestroyed() && w.isVisible() && w.isFocused()) {
    logEvent('toggleWindow.hide')
    w.hide()
  } else {
    logEvent('toggleWindow.show')
    showWindow()
  }
}

module.exports = {
  createMainWindow, navigateMainWindow, createSettingsWindow,
  showWindow, toggleWindow,
}