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

// 注入脚本已移至 src/inject/ 目录，由 windows.js 的 getInjectScript() 按需读取

// Win32 会话头部避让窗口控制按钮区域
const INJECT_SESSION_HEADER_CSS = `
  [data-slot='conversation.session.header'] > header > div:not([role='tablist']) {
    padding-right: calc(184px + 20px);
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
  ICON_PATH,
  DEFAULT_SHORTCUT, READINESS_PREFIX, READINESS_TIMEOUT_MS, HOST_STDOUT_TAIL_LIMIT,
  MAIN_WIN,
  IS_WIN, IS_MAC, IS_LINUX, AUTOSTART_ARG,
  appRootDir, dshHomePath, logDirPath, logFilePath, configFilePath,
  INJECT_SESSION_HEADER_CSS, LOADING_HTML,
}