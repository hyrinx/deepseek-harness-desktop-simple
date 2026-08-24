// ═══════════════════════════════════════════════════════════════
// 常量与纯工具函数（无副作用，可被任意模块安全引用）
// ═══════════════════════════════════════════════════════════════

const { join, dirname } = require('node:path')

const APP_NAME = 'DeepSeek Harness'
const APP_USER_MODEL_ID = 'ai.deepseek.harness.desktop'
const ICON_PATH = join(__dirname, '..', 'assets', 'favicon.ico')
const SETTINGS_HTML = join(__dirname, '..', 'settings.html')
const PRELOAD_SETTINGS = join(__dirname, '..', 'preload', 'preload-settings.js')

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space'
const READINESS_PREFIX = 'dsh web: '
const READINESS_TIMEOUT_MS = 90_000
const HOST_STDOUT_TAIL_LIMIT = 16_384

const MAIN_WIN = Object.freeze({
  width: 1440, height: 920,
  minWidth: 960, minHeight: 640,
})
const SETTINGS_WIN = Object.freeze({
  width: 560, height: 640,
  minWidth: 460, minHeight: 520,
})

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

const AUTOSTART_ARG = '--from-autostart'

function pad2(n) { return String(n).padStart(2, '0') }
function todayStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// 数据根目录：所有数据（日志/配置/runtime）都放在 exe 旁边
// 打包后：exe 所在目录；开发模式：项目根目录（process.cwd()）
// 便携版：electron-builder 会把 app 解压到 %TEMP% 临时目录运行，
// 该目录每次启动都会变，不能作为数据根目录。
// process.env.PORTABLE_EXECUTABLE_DIR 才是用户双击的 exe 所在目录（稳定）。
function appRootDir() {
  const { app } = require('electron')
  if (app.isPackaged) {
    return process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe'))
  }
  // 开发模式：process.execPath 指向 node_modules 内的 electron.exe，
  // 不能作为数据目录，改用项目根目录
  return process.cwd()
}

function logDirPath() { return join(appRootDir(), 'logs') }
function logFilePath(d = new Date()) { return join(logDirPath(), `host-${todayStamp(d)}.log`) }
function recentLogDates(days = 7) {
  const out = []
  const base = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() - i)
    out.push(todayStamp(d))
  }
  return out
}

// 主窗口加载后注入的 JS：悬浮标题栏拖拽（纯 DOM 事件 → IPC → 主进程 setBounds）。
// 不用 -webkit-app-region（会吞掉指针事件，且在 Windows 无边框窗口下命中矩形错位，
// 导致拖拽区附近的按钮点不到）；主进程不用 win.setPosition（Electron #48247/#9477
// 的 bug：仅设置位置会篡改宽高，见 ipc.js 说明）。
// 渲染端还加了 4px 移动阈值：原地长按/单击不会进入拖拽，不产生任何窗口调用。
const INJECT_DRAG_SCRIPT = `
(function() {
  if (window.__dshDragInited) return
  window.__dshDragInited = true

  var DRAG_START_THRESHOLD = 4
  var isDown = false
  var isDragging = false
  var downX = 0, downY = 0
  var lastSentX = -1, lastSentY = -1
  var rafId = null
  var pendingMove = null

  // 判断是否为交互元素（按钮、输入框、链接、tab 等）；交互元素不拦截，可正常点击
  function isInteractive(el) {
    if (!el) return false
    var tag = el.tagName
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT'
        || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (el.getAttribute('role') === 'button'
        || el.getAttribute('role') === 'tab') return true
    if (el.closest && (el.closest('button') || el.closest('a')
        || el.closest('[role="button"]') || el.closest('[role="tab"]'))) return true
    return false
  }

  document.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return
    if (e.clientY > 44) return
    if (isInteractive(e.target)) return
    if (!window.windowDrag) return
    isDown = true
    isDragging = false
    downX = e.screenX
    downY = e.screenY
    lastSentX = e.screenX
    lastSentY = e.screenY
    e.preventDefault()
  })

  // 越过阈值才进入拖拽；拖拽后 rAF 节流 + 位置变化检测再发送坐标
  document.addEventListener('mousemove', function(e) {
    if (!isDown) return
    if (!isDragging) {
      if (Math.abs(e.screenX - downX) < DRAG_START_THRESHOLD
          && Math.abs(e.screenY - downY) < DRAG_START_THRESHOLD) return
      isDragging = true
      lastSentX = e.screenX
      lastSentY = e.screenY
      window.windowDrag.start(e.screenX, e.screenY)
      return
    }
    pendingMove = { x: Math.round(e.screenX), y: Math.round(e.screenY) }
    if (!rafId) {
      rafId = requestAnimationFrame(function() {
        rafId = null
        if (pendingMove && window.windowDrag) {
          var px = pendingMove.x, py = pendingMove.y
          if (px !== lastSentX || py !== lastSentY) {
            lastSentX = px; lastSentY = py
            window.windowDrag.move(px, py)
          }
          pendingMove = null
        }
      })
    }
  })

  function stopDrag() {
    if (!isDown) return
    isDown = false
    if (isDragging) {
      isDragging = false
      pendingMove = null
      lastSentX = lastSentY = -1
      if (rafId) { cancelAnimationFrame(rafId); rafId = null }
      if (window.windowDrag) window.windowDrag.end()
    }
  }
  document.addEventListener('mouseup', stopDrag)
  window.addEventListener('mouseup', stopDrag)
})()`

// Win32 会话头部避让窗口控制按钮区域
const INJECT_SESSION_HEADER_CSS = `
  [data-slot='conversation.session.header'] > header > div:not([role='tablist']) {
    padding-right: calc(138px + 20px);
  }`



// 将 HTML 字符串转为 base64 data URL（兼容 sandbox 渲染器）
function dataUrl(html) {
  return 'data:text/html;charset=utf-8;base64,' + Buffer.from(html, 'utf-8').toString('base64')
}

// 启动 loading 页（内联 data URL，零网络请求，秒弹）
const LOADING_HTML = dataUrl(
  '<!doctype html><html><head><meta charset="utf-8"><style>' +
  'html,body{height:100%;margin:0;background:transparent}' +
  'body{display:flex;align-items:center;justify-content:center;' +
  'font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;' +
  'color:#6b7280;font-size:14px}' +
  '.s{width:28px;height:28px;margin-right:12px;border:3px solid #e5e7eb;' +
  'border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite}' +
  '@keyframes spin{to{transform:rotate(360deg)}}' +
  '</style></head><body>' +
  '<div class="s"></div><span>正在启动 DeepSeek Harness…</span>' +
  '</body></html>'
)

module.exports = {
  APP_NAME, APP_USER_MODEL_ID,
  ICON_PATH, SETTINGS_HTML, PRELOAD_SETTINGS,
  DEFAULT_SHORTCUT, READINESS_PREFIX, READINESS_TIMEOUT_MS, HOST_STDOUT_TAIL_LIMIT,
  MAIN_WIN, SETTINGS_WIN,
  IS_WIN, IS_MAC, AUTOSTART_ARG,
  todayStamp, appRootDir, logDirPath, logFilePath, recentLogDates,
  INJECT_DRAG_SCRIPT, INJECT_SESSION_HEADER_CSS, LOADING_HTML,
}