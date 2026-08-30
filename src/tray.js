// ═══════════════════════════════════════════════════════════════
// 托盘 + 托盘菜单（原生 Tray + BrowserWindow，零第三方依赖）
// 菜单视觉层（HTML/尺寸/preload 常量）与窗口管理都在本文件。
//
// 注意：修改下方 CSS/MENU_HEIGHT 时请同步更新 MENU_HEIGHT 计算。
// ═══════════════════════════════════════════════════════════════

const { join } = require('node:path')
const { nativeImage, ipcMain, screen, Tray, BrowserWindow } = require('electron')
const { state, logEvent } = require('./state')
const { APP_NAME, ICON_PATH, IS_MAC, IS_LINUX } = require('./constants')

// ── 托盘菜单：常量 + 内联 HTML ──

const PRELOAD_PATH = join(__dirname, 'preload', 'preload-tray.js')

// 菜单外框尺寸（必须与下方 HTML/CSS 保持一致）
const MENU_WIDTH = 160
const MENU_PADDING = 4          // .menu padding（对称）
const MENU_ITEM_HEIGHT = 30     // .item height
const MENU_GAP = 2              // .item gap
const MENU_SEPARATOR_HEIGHT = 9 // .sep（1px 线 + 上下 margin 各 4）
const MENU_BORDER = 2           // 上下 border 各 1

// 行序：打开主窗口 / 偏好设置 / 查看日志 / 打开命令行 / 分隔线 / 刷新页面 / 重启 / 退出（共 7 项 + 1 分隔线）
const MENU_HEIGHT = MENU_PADDING * 2
  + MENU_ITEM_HEIGHT * 7
  + MENU_GAP * 7
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
    <div class="item" data-action="terminal">打开命令行</div>
    <div class="sep"></div>
    <div class="item" data-action="reload">刷新页面</div>
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
 * 计算托盘菜单窗口的屏幕位置（自适应，右侧优先）。
 *
 * 依次尝试 4 个方位，选择第一个完全落在屏幕工作区内的：
 *   ① 右-上（首选）  ② 右-下  ③ 左-上  ④ 左-下
 * 若全部越界则贴边 + 右侧优先兜底。
 */
function calcMenuBounds(mousePos, menuSize) {
  const ca = screen.getDisplayNearestPoint(mousePos).workArea
  const { width: mw, height: mh } = menuSize

  const fits = (x, y) =>
    x >= ca.x && x + mw <= ca.x + ca.width &&
    y >= ca.y && y + mh <= ca.y + ca.height

  // 优先级：右侧优先
  const candidates = [
    { x: mousePos.x,        y: mousePos.y - mh },  // 右-上
    { x: mousePos.x,        y: mousePos.y       },  // 右-下
    { x: mousePos.x - mw,   y: mousePos.y - mh },  // 左-上
    { x: mousePos.x - mw,   y: mousePos.y       },  // 左-下
  ]

  for (const c of candidates) {
    const cx = Math.round(c.x)
    const cy = Math.round(c.y)
    if (fits(cx, cy)) return { x: cx, y: cy, width: mw, height: mh }
  }

  // 兜底：全部越界，贴边 + 右侧优先
  let x = Math.round(mousePos.x)
  if (x + mw > ca.x + ca.width) x = Math.max(ca.x, ca.x + ca.width - mw)
  let y = Math.round(mousePos.y - mh)
  if (y < ca.y) y = Math.max(ca.y, ca.y + ca.height - mh)
  return { x, y, width: mw, height: mh }
}

/**
 * 原生 Tray + BrowserWindow 托盘菜单（零第三方依赖）。
 *
 * 左键单击：显隐主窗口
 * 右键单击：弹出菜单窗口，点击菜单项执行对应操作
 * 菜单失焦时自动隐藏
 */
function createTrayAndMenu(callbacks) {
  logEvent('tray.create.start')
  const { onShowMain, onSettings, onOpenLogs, onOpenTerminal, onReload, onRestart, onQuit } = callbacks

  // ── IPC：菜单项点击 ──
  ipcMain.on('tray-menu-select', (_e, action) => {
    logEvent('ipc.tray-menu-select', { action })
    hideMenuWindow()
    const fn = { show: onShowMain, settings: onSettings,
      logs: onOpenLogs, terminal: onOpenTerminal, reload: onReload, restart: onRestart, quit: onQuit }[action]
    if (!fn) return
    try {
      const r = fn()
      if (r && typeof r.catch === 'function')
        r.catch((err) => logEvent(`action.${action}.fail`, { err }, 'error'))
    } catch (err) {
      logEvent(`action.${action}.throw`, { err }, 'error')
    }
  })

  // ── 创建托盘 ──
  const tray = new Tray(trayImage())
  if (!IS_MAC) tray.setToolTip(APP_NAME)  // macOS 菜单栏图标不支持 tooltip
  state.tray = tray
  logEvent('tray.created', { trayExists: Boolean(tray) })

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
    showMenuWindow()
  })

  tray.on('destroy', () => logEvent('tray.destroy', { isQuitting: state.isQuitting }, state.isQuitting ? 'info' : 'warn'))
  tray.on('balloon-show', () => logEvent('tray.balloon-show'))
  tray.on('balloon-click', () => logEvent('tray.balloon-click'))
  tray.on('balloon-closed', () => logEvent('tray.balloon-closed'))

  // ── 菜单窗口（懒创建，复用；移到屏幕外代替 hide 消除频闪） ──
  //
  // 频闪根因：frameless 透明窗口在 hide() → show() 循环中，每次 show() 都会在
  // Windows 上重建原生窗口表面（HWND surface），重建瞬间短暂露出白色/默认背景。
  // 解决方案：窗口只 show() 一次，后续"隐藏"时移到屏幕外（-9999, -9999），
  // "显示"时移回目标位置。窗口表面永不销毁，也无需 opacity/鼠标穿透的 hack。
  const OFFSCREEN = { x: -9999, y: -9999 }
  let menuWin = null
  let menuSize = { width: MENU_WIDTH, height: MENU_HEIGHT }
  let menuReady = false
  let pendingShowPos = null

  function getOrCreateMenuWindow() {
    if (menuWin && !menuWin.isDestroyed()) return menuWin

    menuWin = new BrowserWindow({
      width: MENU_WIDTH, height: MENU_HEIGHT,
      show: false,
      frame: false,
      transparent: !IS_LINUX,  // Linux 部分桌面环境（Xfce/MATE/无合成器）不支持透明窗口
      resizable: false, movable: false,
      skipTaskbar: true, alwaysOnTop: true, focusable: true,
      fullscreenable: false, hasShadow: false,
      backgroundColor: IS_LINUX ? '#ffffff' : '#00000000',
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    })
    logEvent('menu-window.created', { id: menuWin.id })

    try { menuWin.setAlwaysOnTop(true, 'screen-saver') }
    catch (err) { logEvent('menu-window.topmost.fail', { err }, 'warn') }

    // 内容就绪后：移到屏幕外再 show()，初始化窗口表面但对用户不可见
    menuWin.once('ready-to-show', () => {
      menuReady = true
      menuWin.setBounds({ ...OFFSCREEN, width: menuSize.width, height: menuSize.height })
      menuWin.show()

      if (pendingShowPos && menuWin && !menuWin.isDestroyed()) {
        const bounds = calcMenuBounds(pendingShowPos, menuSize)
        menuWin.setBounds(bounds)
        menuWin.focus()
        pendingShowPos = null
        logEvent('menu-window.first-show', { bounds })
      }
    })

    // 内容加载后测量实际尺寸，自适应窗口宽高
    menuWin.webContents.on('did-finish-load', () => {
      try {
        menuWin.webContents.executeJavaScript(`
          (function() {
            var body = document.body
            var html = document.documentElement
            var w = Math.max(body.scrollWidth, body.offsetWidth, html.clientWidth, 120)
            var h = Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight)
            return { width: Math.ceil(w), height: Math.ceil(h) }
          })()
        `).then((size) => {
          if (size && menuWin && !menuWin.isDestroyed()) {
            menuSize = { width: size.width, height: size.height }
            menuWin.setSize(size.width, size.height)
            logEvent('menu-window.resize', { width: size.width, height: size.height })
          }
        }).catch(() => {})
      } catch (err) { logEvent('menu-window.resize.fail', { err }, 'warn') }
    })

    // 失焦后移到屏幕外（不销毁窗口表面）
    menuWin.on('blur', () => {
      logEvent('menu-window.blur')
      hideMenuWindow()
    })

    menuWin.on('closed', () => {
      logEvent('menu-window.closed')
      menuWin = null
      menuReady = false
    })

    menuWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(MENU_HTML)}`)
    return menuWin
  }

  function showMenuWindow() {
    const win = getOrCreateMenuWindow()
    const mousePos = screen.getCursorScreenPoint()

    if (menuReady && !win.isDestroyed()) {
      const bounds = calcMenuBounds(mousePos, menuSize)
      logEvent('menu-window.position', { mousePos, bounds })
      win.setBounds(bounds)
      win.focus()
    } else {
      pendingShowPos = mousePos
      logEvent('menu-window.pending-show', { mousePos })
    }
  }

  function hideMenuWindow() {
    if (menuWin && !menuWin.isDestroyed()) {
      try {
        menuWin.setBounds({ ...OFFSCREEN, width: menuSize.width, height: menuSize.height })
      } catch (err) { logEvent('menu-window.hide.fail', { err }, 'warn') }
    }
  }

  // ── 暴露给外部的托盘菜单接口 ──
  state.trayMenu = {
    show: showMenuWindow,
    hide: hideMenuWindow,
    destroy: () => {
      if (menuWin && !menuWin.isDestroyed()) {
        try { menuWin.destroy() } catch {}
        menuWin = null
      }
      if (tray && !tray.isDestroyed()) {
        try { tray.destroy() } catch {}
      }
    },
  }
  logEvent('tray.create.ok')
}

module.exports = { createTrayAndMenu }