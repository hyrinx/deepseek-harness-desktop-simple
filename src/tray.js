// ═══════════════════════════════════════════════════════════════
// 托盘与托盘菜单（electron-menubar 封装）
// ═══════════════════════════════════════════════════════════════

const { nativeImage, ipcMain, screen } = require('electron')
const { menubar } = require('electron-menubar')
const { state, logEvent } = require('./state')
const { APP_NAME, ICON_PATH, IS_WIN } = require('./constants')
const {
  MENU_HTML: TRAY_MENU_HTML,
  PRELOAD_PATH: TRAY_MENU_PRELOAD,
  MENU_WIDTH: TRAY_MENU_WIDTH,
  MENU_HEIGHT: TRAY_MENU_HEIGHT,
} = require('./tray-menu')

function trayImage() {
  const image = nativeImage.createFromPath(ICON_PATH)
  if (image.isEmpty()) {
    logEvent('tray.image.empty', { iconPath: ICON_PATH }, 'warn')
    return nativeImage.createEmpty()
  }
  return image
}

/**
 * electron-menubar 封装：自建 Tray，重绑左右键语义。
 *
 * 位置修正：electron-menubar 在 Windows 下每次 showWindow 都会调用
 * applyWindowPosition → getWindowPosition() 覆盖 windowPosition 为
 * 'bottomRight'（屏幕右下角）。我们通过 monkey-patch 跳过原始逻辑，
 * 直接用鼠标位置定位：菜单左边缘在鼠标右侧，底边缘在鼠标上方，
 * 即菜单出现在鼠标的右上角。
 */
function createTrayAndMenu(callbacks, _logEvent) {
  _logEvent('tray.create.start')
  const { onShowMain, onSettings, onOpenLogs, onRestart, onQuit } = callbacks

  ipcMain.on('tray-menu-select', (_e, action) => {
    _logEvent('ipc.tray-menu-select', { action })
    state.trayMenu?.hide?.()
    const fn = { show: onShowMain, settings: onSettings,
      logs: onOpenLogs, restart: onRestart, quit: onQuit }[action]
    if (!fn) return
    try {
      const r = fn()
      if (r && typeof r.catch === 'function')
        r.catch((err) => _logEvent(`action.${action}.fail`, { err }, 'error'))
    } catch (err) {
      _logEvent(`action.${action}.throw`, { err }, 'error')
    }
  })

  const mb = menubar({
    icon: trayImage(),
    tooltip: APP_NAME,
    index: `data:text/html;charset=utf-8,${encodeURIComponent(TRAY_MENU_HTML)}`,
    preloadWindow: true,
    windowPosition: IS_WIN ? 'trayBottomCenter' : 'trayCenter',
    browserWindow: {
      width: TRAY_MENU_WIDTH, height: TRAY_MENU_HEIGHT,
      frame: false, transparent: true, resizable: false, movable: false,
      skipTaskbar: true, alwaysOnTop: true, focusable: true,
      fullscreenable: false, hasShadow: false, backgroundColor: '#00000000',
      webPreferences: {
        preload: TRAY_MENU_PRELOAD,
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    },
  })

  mb.on('after-create-window', () => {
    try { mb.window?.setAlwaysOnTop?.(true, 'screen-saver') }
    catch (err) { _logEvent('menubar.topmost.fail', { err }, 'warn') }
    _logEvent('menubar.window.created', { id: mb.window?.id })

    // monkey-patch: electron-menubar 在 Windows 下每次 showWindow 都会调用
    // applyWindowPosition → getWindowPosition() 覆盖 windowPosition 为
    // 'bottomRight'（屏幕右下角）。这里直接跳过原始逻辑，用鼠标位置定位：
    // 菜单左边缘在鼠标右侧，底边缘在鼠标上方，即菜单在鼠标右上角。
    mb.applyWindowPosition = () => {
      const mp = state.trayMenu?._mousePos
      if (mp && mb.window && !mb.window.isDestroyed()) {
        try {
          const menuX = Math.round(mp.x)
          const menuY = Math.round(mp.y - TRAY_MENU_HEIGHT)
          mb.window.setPosition(menuX, menuY)
        } catch (err) {
          _logEvent('menubar.reposition.fail', { err }, 'warn')
        }
      }
    }
  })
  mb.on('show', () => _logEvent('menubar.show'))
  mb.on('hide', () => _logEvent('menubar.hide'))

  state.trayMenu = {
    show: (bounds) => {
      state.trayMenu._mousePos = screen.getCursorScreenPoint()
      return mb.showWindow(bounds)
    },
    hide: () => { try { mb.hideWindow() } catch (e) { _logEvent('menubar.hide.fail', { err: e }, 'warn') } },
    destroy: () => {
      try { mb.window?.isDestroyed?.() || mb.window?.destroy?.() } catch {}
      try { mb.tray?.destroy?.() } catch {}
    },
  }
  _logEvent('menubar.create.ok')

  mb.on('ready', () => {
    const tray = mb.tray
    state.tray = tray
    _logEvent('menubar.ready', { trayExists: Boolean(tray) })
    if (!tray) return

    tray.removeAllListeners('click')
    tray.removeAllListeners('right-click')

    tray.on('click', (_e, bounds) => {
      _logEvent('tray.click', { bounds: bounds ? { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height } : null })
      try {
        const { showWindow } = require('./windows')
        showWindow()
      } catch (err) { _logEvent('tray.click.showWindow.fail', { err }, 'error') }
    })
    tray.on('right-click', (_e, bounds) => {
      _logEvent('tray.right-click', {
        bounds: bounds ? { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height } : null,
      })
      state.trayMenu?.show?.(bounds)
    })
    tray.on('double-click', () => _logEvent('tray.double-click'))
    tray.on('destroy', () => _logEvent('tray.destroy', { isQuitting: state.isQuitting }, state.isQuitting ? 'info' : 'warn'))
    tray.on('balloon-show', () => _logEvent('tray.balloon-show'))
    tray.on('balloon-click', () => _logEvent('tray.balloon-click'))
    tray.on('balloon-closed', () => _logEvent('tray.balloon-closed'))
  })
}

module.exports = { createTrayAndMenu }