// ═══════════════════════════════════════════════════════════════
// 常量与纯工具函数（无副作用，可被任意模块安全引用）
// ═══════════════════════════════════════════════════════════════

const { dirname, join } = require('node:path')

const APP_NAME = 'DeepSeek Harness'
const APP_USER_MODEL_ID = 'ai.deepseek.harness.desktop'
const ICON_PATH = join(__dirname, '..', 'assets', 'favicon.ico')

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space'
const READINESS_PREFIX = 'dsh web: '
const READINESS_TIMEOUT_MS = 90_000
const HOST_STDOUT_TAIL_LIMIT = 16_384

const MAIN_WIN = Object.freeze({
  width: 1440, height: 920,
  minWidth: 960, minHeight: 640,
})

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'
const IS_LINUX = process.platform === 'linux'

const AUTOSTART_ARG = '--silence'

// 开发模式数据根目录：项目根目录（process.cwd()）
// 打包后：exe 所在目录（便携版用 PORTABLE_EXECUTABLE_DIR）
// 仅开发模式使用，打包后数据走 dsh 插件标准路径
function appRootDir() {
  const { app } = require('electron')
  if (app.isPackaged) {
    return process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe'))
  }
  return process.cwd()
}

const { dshHomePath } = require('./dsh-home')

// 日志路径：遵循 dsh-plugin-open-with 标准
//   - 开发模式：项目根目录
//   - 安装模式：$DSH_HOME/logs/deepseek-harness-desktop/
function logDirPath() {
  if (require('./env').mode() === 'dev') return appRootDir()
  return dshHomePath('logs', 'deepseek-harness-desktop')
}
function logFilePath() { return join(logDirPath(), 'host.log') }

// 配置文件路径：遵循 dsh 插件标准
//   - 开发模式：项目根目录
//   - 安装模式：$DSH_HOME/storages/deepseek-harness-desktop/
function configDirPath() {
  if (require('./env').mode() === 'dev') return appRootDir()
  return dshHomePath('storages', 'deepseek-harness-desktop')
}
function configFilePath() { return join(configDirPath(), 'config.json') }

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

  // 悬浮标题栏双击最大化/还原
  document.addEventListener('dblclick', function(e) {
    if (e.clientY > 44) return
    if (isInteractive(e.target)) return
    if (!window.windowDrag || !window.windowDrag.toggleMaximize) return
    window.windowDrag.toggleMaximize()
  })
})()`

// Win32 会话头部避让窗口控制按钮区域
const INJECT_SESSION_HEADER_CSS = `
  [data-slot='conversation.session.header'] > header > div:not([role='tablist']) {
    padding-right: calc(138px + 20px);
  }`

// Win32 自绘窗口控制按钮（─ □ ✕），替代 titleBarOverlay 的系统按钮。
// 去掉系统按钮后，按钮变成普通 DOM 元素，可以用 z-index 控制层级，从而让浮层
// （插件面板 / 图片放大预览）打开时能盖住按钮——这样浮层自己的右上角关闭按钮
// 就能被点到；浮层关闭后按钮重新露出、窗口按钮又能正常点。整个过程不再移动页面
// 里的任何元素，因此壁纸全屏、左侧栏置顶等布局都保持不变。
const INJECT_WINDOW_CONTROLS_SCRIPT = `
(function() {
  if (window.__dshWindowControlsInited) return
  window.__dshWindowControlsInited = true
  if (!window.windowControls) return

  // 层级：按钮 z-index 需“高于普通页面内容、低于浮层”。浮层（modal/图片预览/插件面板）
  // 的 z-index 通常远超此值，因此打开时会盖住按钮（浮层关闭按钮可点），关闭后按钮恢复。
  // 实测若按钮被普通内容盖住 → 调大；若浮层关闭按钮仍点不到 → 调小（再回来看为何）。
  var Z = 100

  var SVG_MIN = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 5 H9.5" stroke="currentColor" stroke-width="1"/></svg>'
  var SVG_MAX = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
  var SVG_RESTORE = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 0.5 H9.5 V7" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
  var SVG_CLOSE = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="currentColor" stroke-width="1"/></svg>'

  function makeBtn(inner, title, close) {
    var b = document.createElement('button')
    b.type = 'button'
    b.title = title
    b.setAttribute('aria-label', title)
    b.style.cssText = 'width:46px;height:44px;padding:0;margin:0;border:0;outline:0;background:transparent;cursor:default;display:flex;align-items:center;justify-content:center;color:#c9ccd1;'
    b.innerHTML = inner
    b.addEventListener('mouseenter', function() {
      b.style.background = close ? '#e81123' : 'rgba(255,255,255,0.085)'
      b.style.color = '#ffffff'
    })
    b.addEventListener('mouseleave', function() {
      b.style.background = 'transparent'
      b.style.color = '#c9ccd1'
    })
    return b
  }

  var host = document.createElement('div')
  host.setAttribute('data-dsh-window-controls', '1')
  host.style.cssText = 'position:fixed;top:0;right:0;height:44px;display:flex;align-items:stretch;z-index:' + Z + ';'

  var btnMin = makeBtn(SVG_MIN, '最小化', false)
  var btnMax = makeBtn(SVG_MAX, '最大化', false)
  var btnClose = makeBtn(SVG_CLOSE, '关闭', true)

  btnMin.addEventListener('click', function() { window.windowControls.minimize() })
  btnMax.addEventListener('click', function() { window.windowControls.toggleMaximize() })
  btnClose.addEventListener('click', function() { window.windowControls.close() })

  function setMaxIcon(isMax) {
    btnMax.innerHTML = isMax ? SVG_RESTORE : SVG_MAX
    btnMax.title = isMax ? '还原' : '最大化'
    btnMax.setAttribute('aria-label', btnMax.title)
  }
  window.windowControls.isMaximized().then(setMaxIcon).catch(function() {})
  if (window.windowControls.onMaximizeChange) {
    window.windowControls.onMaximizeChange(setMaxIcon)
  }

  // 顺序：最小化 / 最大化 / 关闭（关闭在最右，Windows 惯例）
  host.appendChild(btnMin)
  host.appendChild(btnMax)
  host.appendChild(btnClose)
  ;(document.body || document.documentElement).appendChild(host)
})()`



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
  ICON_PATH,
  DEFAULT_SHORTCUT, READINESS_PREFIX, READINESS_TIMEOUT_MS, HOST_STDOUT_TAIL_LIMIT,
  MAIN_WIN,
  IS_WIN, IS_MAC, IS_LINUX, AUTOSTART_ARG,
  appRootDir, dshHomePath, logDirPath, logFilePath, configFilePath,
  INJECT_DRAG_SCRIPT, INJECT_SESSION_HEADER_CSS, INJECT_WINDOW_CONTROLS_SCRIPT, LOADING_HTML,
}