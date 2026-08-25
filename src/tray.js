// ═══════════════════════════════════════════════════════════════
// 托盘 + 托盘菜单（electron-menubar 封装）
// 菜单视觉层（HTML/尺寸/preload 常量）与窗口管理都在本文件。
//
// 注意：修改下方 CSS/MENU_HEIGHT 时请同步更新 MENU_HEIGHT 计算。
// ═══════════════════════════════════════════════════════════════

const { join } = require('node:path')
const { nativeImage, ipcMain, screen } = require('electron')
const { menubar } = require('electron-menubar')
const { state, logEvent } = require('./state')
const { APP_NAME, ICON_PATH, IS_WIN } = require('./constants')

// ── 托盘菜单：常量 + 内联 HTML ──

const PRELOAD_PATH = join(__dirname, '..', 'preload', 'preload-tray.js')

// 菜单外框尺寸（必须与下方 HTML/CSS 保持一致）
const MENU_WIDTH = 160
const MENU_PADDING = 4          // .menu padding（对称）
const MENU_ITEM_HEIGHT = 30     // .item height
const MENU_GAP = 2              // .item gap
const MENU_SEPARATOR_HEIGHT = 9 // .sep（1px 线 + 上下 margin 各 4）
const MENU_BORDER = 2           // 上下 border 各 1

// 行序：打开主窗口 / 偏好设置 / 查看日志 / 分隔线 / 重启 / 退出（共 5 项 + 1 分隔线）
const MENU_HEIGHT = MENU_PADDING * 2
  + MENU_ITEM_HEIGHT * 5
  + MENU_GAP * 5
  + MENU_SEPARATOR_HEIGHT
  + MENU_BORDER

const MENU_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; background: transparent; }
  body {
    font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    font-size: 13px;
    color: #1f2329;
  }
  .menu {
    width: 100%;
    height: 100%;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, .12);
    border-radius: 6px;
    padding: ${MENU_PADDING}px;
    display: flex;
    flex-direction: column;
    gap: ${MENU_GAP}px;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  }
  .item {
    height: ${MENU_ITEM_HEIGHT}px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-radius: 4px;
    cursor: default;
  }
  .item:hover { background: #eef0f3; }
  .item:active { background: #e2e5ea; }
  .sep { height: 1px; background: #e5e6e8; margin: 4px 8px; }
</style>
</head>
<body>
  <div class="menu">
    <div class="item" data-action="show">打开主窗口</div>
    <div class="item" data-action="settings">偏好设置</div>
    <div class="item" data-action="logs">查看日志</div>
    <div class="sep"></div>
    <div class="item" data-action="restart">重启</div>
    <div class="item" data-action="quit">退出</div>
  </div>
  <script>
    document.querySelectorAll('.item').forEach(function(el) {
      el.addEventListener('click', function() {
        var action = this.getAttribute('data-action')
        if (action) window.electronAPI.ipc.send('tray-menu-select', action)
      })
    })
  </script>
</body>
</html>`

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
function createTrayAndMenu(callbacks) {
  logEvent('tray.create.start')
  const { onShowMain, onSettings, onOpenLogs, onRestart, onQuit } = callbacks

  ipcMain.on('tray-menu-select', (_e, action) => {
    logEvent('ipc.tray-menu-select', { action })
    state.trayMenu?.hide?.()
    const fn = { show: onShowMain, settings: onSettings,
      logs: onOpenLogs, restart: onRestart, quit: onQuit }[action]
    if (!fn) return
    try {
      const r = fn()
      if (r && typeof r.catch === 'function')
        r.catch((err) => logEvent(`action.${action}.fail`, { err }, 'error'))
    } catch (err) {
      logEvent(`action.${action}.throw`, { err }, 'error')
    }
  })

  const mb = menubar({
    icon: trayImage(),
    tooltip: APP_NAME,
    index: `data:text/html;charset=utf-8,${encodeURIComponent(MENU_HTML)}`,
    preloadWindow: true,
    windowPosition: IS_WIN ? 'trayBottomCenter' : 'trayCenter',
    browserWindow: {
      width: MENU_WIDTH, height: MENU_HEIGHT,
      frame: false, transparent: true, resizable: false, movable: false,
      skipTaskbar: true, alwaysOnTop: true, focusable: true,
      fullscreenable: false, hasShadow: false, backgroundColor: '#00000000',
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    },
  })

  mb.on('after-create-window', () => {
    try { mb.window?.setAlwaysOnTop?.(true, 'screen-saver') }
    catch (err) { logEvent('menubar.topmost.fail', { err }, 'warn') }
    logEvent('menubar.window.created', { id: mb.window?.id })

    // monkey-patch: electron-menubar 在 Windows 下每次 showWindow 都会调用
    // applyWindowPosition → getWindowPosition() 覆盖 windowPosition 为
    // 'bottomRight'（屏幕右下角）。这里直接跳过原始逻辑，用鼠标位置定位：
    // 菜单左边缘在鼠标右侧，底边缘在鼠标上方，即菜单在鼠标右上角。
    mb.applyWindowPosition = () => {
      const mp = state.trayMenu?._mousePos
      if (mp && mb.window && !mb.window.isDestroyed()) {
        try {
          const menuX = Math.round(mp.x)
          const menuY = Math.round(mp.y - MENU_HEIGHT)
          mb.window.setPosition(menuX, menuY)
        } catch (err) {
          logEvent('menubar.reposition.fail', { err }, 'warn')
        }
      }
    }
  })
  mb.on('show', () => logEvent('menubar.show'))
  mb.on('hide', () => logEvent('menubar.hide'))

  state.trayMenu = {
    show: (bounds) => {
      state.trayMenu._mousePos = screen.getCursorScreenPoint()
      return mb.showWindow(bounds)
    },
    hide: () => { try { mb.hideWindow() } catch (e) { logEvent('menubar.hide.fail', { err: e }, 'warn') } },
    destroy: () => {
      try { mb.window?.isDestroyed?.() || mb.window?.destroy?.() } catch {}
      try { mb.tray?.destroy?.() } catch {}
    },
  }
  logEvent('menubar.create.ok')

  mb.on('ready', () => {
    const tray = mb.tray
    state.tray = tray
    logEvent('menubar.ready', { trayExists: Boolean(tray) })
    if (!tray) return

    tray.removeAllListeners('click')
    tray.removeAllListeners('right-click')

    tray.on('click', (_e, bounds) => {
      logEvent('tray.click', { bounds: bounds ? { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height } : null })
      try {
        const { showWindow } = require('./windows')
        showWindow()
      } catch (err) { logEvent('tray.click.showWindow.fail', { err }, 'error') }
    })
    tray.on('right-click', (_e, bounds) => {
      logEvent('tray.right-click', {
        bounds: bounds ? { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height } : null,
      })
      state.trayMenu?.show?.(bounds)
    })
    tray.on('double-click', () => logEvent('tray.double-click'))
    tray.on('destroy', () => logEvent('tray.destroy', { isQuitting: state.isQuitting }, state.isQuitting ? 'info' : 'warn'))
    tray.on('balloon-show', () => logEvent('tray.balloon-show'))
    tray.on('balloon-click', () => logEvent('tray.balloon-click'))
    tray.on('balloon-closed', () => logEvent('tray.balloon-closed'))
  })
}

module.exports = { createTrayAndMenu }
