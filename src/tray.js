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
const { APP_NAME, ICON_PATH, IS_WIN, IS_LINUX } = require('./constants')

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
 * 位置修正（Windows / Linux）：electron-menubar 在 Windows 下每次
 * showWindow 都会调用 applyWindowPosition → getWindowPosition() 覆盖
 * windowPosition 为 'bottomRight'（屏幕右下角）。我们通过 monkey-patch
 * 跳过原始逻辑，直接用鼠标位置 + setBounds 定位：默认菜单左边缘在鼠标
 * 右侧、底边缘在鼠标上方（鼠标右上角）；若鼠标上方空间不足（如 Linux
 * 顶部面板托盘）则自动向下展开，并在左右溢出时向内收缩，保证菜单不越界。
 *
 * macOS 上不需要 monkey-patch：electron-menubar 的 trayCenter 在菜单栏
 * 图标下方原生定位已正确。
 *
 * 垂直偏移修复：menubar 内部在 showWindow 时可能重置窗口尺寸为
 * browserWindow 配置的初始值（200x200），导致 getBounds().height
 * 返回错误值 → 定位偏移。改用 did-finish-load 后缓存的 menuSize，
 * 通过 setBounds 一次性设置位置+尺寸，彻底消除偏移。
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

    // 初始取已知真实尺寸，避免 did-finish-load 异步测量前使用假尺寸（200x200）
    let menuSize = { width: MENU_WIDTH, height: MENU_HEIGHT }

    // 内容加载后测量实际尺寸，自适应窗口宽高
    mb.window.webContents.on('did-finish-load', () => {
      try {
        mb.window.webContents.executeJavaScript(`
          (function() {
            var body = document.body
            var html = document.documentElement
            var w = Math.max(body.scrollWidth, body.offsetWidth, html.clientWidth, 120)
            var h = Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight)
            return { width: Math.ceil(w), height: Math.ceil(h) }
          })()
        `).then((size) => {
          if (size && mb.window && !mb.window.isDestroyed()) {
            menuSize = { width: size.width, height: size.height }
            mb.window.setSize(size.width, size.height)
            logEvent('menubar.resize', { width: size.width, height: size.height })
          }
        }).catch(() => {})
      } catch (err) { logEvent('menubar.resize.fail', { err }, 'warn') }
    })

    // Windows / Linux：monkey-patch 用 setBounds 一次性设置位置+尺寸。
    // 默认定位鼠标右上角；上方空间不足时向下展开，左右越界时向内收缩，
    // 保证菜单始终落在当前屏幕工作区内。macOS 不覆盖，用 menubar 默认定位。
    if (IS_WIN || IS_LINUX) {
      mb.applyWindowPosition = () => {
        const mp = state.trayMenu?._mousePos
        if (mp && mb.window && !mb.window.isDestroyed()) {
          try {
            const ca = screen.getDisplayNearestPoint(mp).workArea
            const fitAbove = (mp.y - menuSize.height) >= ca.y
            const menuY = fitAbove ? Math.round(mp.y - menuSize.height) : Math.round(mp.y)
            let menuX = Math.round(mp.x)
            const maxX = ca.x + ca.width - menuSize.width
            if (menuX > maxX) menuX = Math.max(ca.x, Math.round(mp.x - menuSize.width))
            mb.window.setBounds({
              x: menuX,
              y: menuY,
              width: menuSize.width,
              height: menuSize.height,
            })
          } catch (err) {
            logEvent('menubar.reposition.fail', { err }, 'warn')
          }
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