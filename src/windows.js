// ═══════════════════════════════════════════════════════════════
// 主窗口 + 设置覆盖层（创建 / 导航 / CSS 注入 / 覆盖层显示切换）
// ═══════════════════════════════════════════════════════════════

const { join } = require('node:path')
const { BrowserWindow, shell, screen } = require('electron')
const { state, logEvent, bootMark } = require('./state')
const { store } = require('./store')
const {
  APP_NAME, ICON_PATH,
  MAIN_WIN, IS_WIN, IS_MAC, IS_LINUX,
  DEFAULT_SHORTCUT, INJECT_SESSION_HEADER_CSS, LOADING_HTML,
} = require('./constants')

const PRELOAD_MAIN = join(__dirname, 'preload', 'preload-main.js')

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
    frame: false,
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

// ── 注入脚本缓存（从 src/inject/ 目录读取，避免内联长字符串）
const fs = require('node:fs')
const _injectCache = Object.create(null)
function getInjectScript(name) {
  if (_injectCache[name]) return _injectCache[name]
  const filePath = join(__dirname, 'inject', name + '.js')
  _injectCache[name] = fs.readFileSync(filePath, 'utf-8')
  return _injectCache[name]
}

function injectMainWindowCSS(win) {
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(getInjectScript('inject-drag')).catch(() => {})
    win.webContents.executeJavaScript(getInjectScript('inject-window-controls')).catch(() => {})
    win.webContents.executeJavaScript(getInjectScript('inject-market-restart')).catch(() => {})
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
  win.on('maximize', () => {
    win.webContents.send('window-maximize-change', true)
  })
  win.on('unmaximize', () => {
    win.webContents.send('window-maximize-change', false)
  })
  win.on('close', (event) => {
    if (!state.isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    if (state.mainWindow === win) state.mainWindow = null
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    logEvent('main-window.render-process-gone', { id, reason: details.reason, exitCode: details.exitCode }, 'error')
  })
  win.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedUrl, isMainFrame) => {
    if (!isMainFrame) return
    logEvent('main-window.did-fail-load', { id, errorCode, errorDesc, url: validatedUrl }, 'error')
  })
  win.on('unresponsive', () => {
    logEvent('main-window.unresponsive', { id }, 'warn')
  })
}

// ── 窗口位置/尺寸记忆 ──

function restoreWindowBounds(win) {
  const saved = store.get('ui.windowBounds')
  if (!saved || !saved.width || !saved.height) return
  if (saved.x === undefined || saved.y === undefined) return
  // 校验保存的坐标是否在任一屏幕范围内（防止外接显示器拔掉后窗口不可见）
  const displays = screen.getAllDisplays()
  const visible = displays.some(function (d) {
    return saved.x >= d.bounds.x - 100 && saved.x < d.bounds.x + d.bounds.width - 100 &&
           saved.y >= d.bounds.y - 100 && saved.y < d.bounds.y + d.bounds.height - 100
  })
  if (!visible) {
    return
  }
  win.setBounds(saved)
}

function bindWindowBoundsSave(win) {
  let saveTimer = null
  function save() {
    if (win.isDestroyed() || win.isMaximized() || win.isMinimized()) return
    const bounds = win.getBounds()
    store.set('ui.windowBounds', { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
  }
  function debouncedSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 300)
  }
  win.on('resize', debouncedSave)
  win.on('move', debouncedSave)
  // 退出时立即保存，不等 debounce
  win.on('close', function () {
    clearTimeout(saveTimer)
    save()
  })
}

function createMainWindow(options = {}) {
  const { silent = false } = options
  const win = new BrowserWindow(buildMainWindowOptions())
  state.mainWindow = win

  bindMainWindowLifecycle(win)
  bindWindowBoundsSave(win)
  restoreWindowBounds(win)

  bootMark('load loading page')
  win.loadURL(LOADING_HTML).then(() => {
    if (!state.isQuitting && !silent) {
      win.show()
      bootMark('show window (loading)')
    }
  }).catch((err) => {
    logEvent('main-window.load-loading.fail', { id: win.id, err }, 'error')
    if (!state.isQuitting && !silent) win.show()
  })
  return win
}

async function navigateMainWindow() {
  const win = state.mainWindow
  if (!win || win.isDestroyed()) {
    return
  }
  const origin = state.hostOrigin
  try {
    if (!origin) {
      return
    }

    bindMainWindowNavigation(win, origin)
    injectMainWindowCSS(win)

    const rendererUrl = new URL(origin)
    rendererUrl.searchParams.set('dsh-desktop-platform', process.platform)
    bootMark('navigate to host')
    await win.loadURL(rendererUrl.href)
    bootMark('loadURL done')
  } catch (err) {
    logEvent('main-window.navigate.fail', { id: win.id, err }, 'error')
  }
}

// ── 设置覆盖层（注入到主窗口，浮在 dsh 网页上方） ──
// 模块已拆分到 settings-overlay/ 目录下，按顺序拼接后替换 __DSH_SETTINGS_MODULES__ 占位符。
// CSS/HTML 使用 __DSH_SETTINGS_CSS__ / __DSH_SETTINGS_HTML__ 占位符。

const SETTINGS_MODULE_ORDER = [
  'shortcut', 'toast', 'ipc', 'autostart', 'env', 'update', 'events',
]

let _overlayScript = null
function getOverlayScript() {
  if (_overlayScript) return _overlayScript
  const dir = join(__dirname, 'settings-overlay')
  const css = JSON.stringify(fs.readFileSync(join(dir, 'style.css'), 'utf-8'))
  const html = JSON.stringify(fs.readFileSync(join(dir, 'settings-overlay.html'), 'utf-8'))
  const js = fs.readFileSync(join(dir, 'settings-overlay.js'), 'utf-8')
  const modules = SETTINGS_MODULE_ORDER
    .map(function (name) { return fs.readFileSync(join(dir, name + '.js'), 'utf-8') })
    .join('\n')
  _overlayScript = js
    .replace('__DSH_SETTINGS_CSS__', css)
    .replace('__DSH_SETTINGS_HTML__', html)
    .replace('__DSH_DEFAULT_SHORTCUT__', JSON.stringify(DEFAULT_SHORTCUT))
    .replace('// __DSH_SETTINGS_MODULES__', modules)
  return _overlayScript
}

function showSettingsOverlay() {
  showWindow()

  const win = state.mainWindow
  if (!win || win.isDestroyed()) {
    return
  }
  const injectedKey = '__dshSettingsOverlayInjected'
  win.webContents.executeJavaScript(`(function(){
    if (window.${injectedKey}) {
      if (window.__dshShowSettingsOverlay) window.__dshShowSettingsOverlay()
    } else {
      ${getOverlayScript()}
      if (window.__dshShowSettingsOverlay) window.__dshShowSettingsOverlay()
    }
  })()`).catch((err) => {
    logEvent('settings-overlay.show.fail', { err }, 'error')
  })
}

function hideSettingsOverlay() {
  const win = state.mainWindow
  if (!win || win.isDestroyed()) return
  win.webContents.executeJavaScript(
    'if (window.__dshHideSettingsOverlay) window.__dshHideSettingsOverlay()'
  ).catch(() => {})
}

// ── 显示/切换 ──

function showWindow() {
  if (state.isQuitting) {
    return
  }
  if (!state.mainWindow || state.mainWindow.isDestroyed()) {
    if (state.hostOrigin) {
      try {
        createMainWindow()
        navigateMainWindow()
      } catch (e) {
        logEvent('showWindow.recreate.fail', { err: e }, 'error')
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
    w.hide()
  } else {
    showWindow()
  }
}

module.exports = {
  createMainWindow, navigateMainWindow,
  showSettingsOverlay, hideSettingsOverlay,
  showWindow, toggleWindow,
}