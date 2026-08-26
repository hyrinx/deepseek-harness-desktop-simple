// ═══════════════════════════════════════════════════════════════
// DeepSeek Harness (DSH) 轻量桌面包装 — 主入口
//
// 模块结构：
//   src/constants.js  — 常量 + 路径函数 + 注入脚本
//   src/state.js      — 全局状态 + 日志基础设施 + 进程守卫
//   src/store.js      — 配置存储（开发：根目录；打包：~/.dsh/storages/）
//   src/env.js        — 运行时模式 + 环境检测 + 插件安装
//   src/dsh-home.js   — DSH 路径解析（与 @deepseek-ai/dsh-home-paths 一致）
//   src/host.js       — dsh 子进程管理（spawn / 就绪 / 终止）
//   src/windows.js    — 主窗口 + 设置覆盖层（创建 / 导航 / 覆盖层注入）
//   src/tray.js       — 托盘 + 托盘菜单（原生 Tray + BrowserWindow）
//   src/autostart.js  — 开机自启
//   src/ipc.js        — IPC 处理器 + 全局快捷键 + 窗口拖拽
//   src/lifecycle.js  — 生命周期（destroyUI / 退出 / 重启 / 启动）
//   src/settings-overlay/  — 设置覆盖层（CSS/HTML/JS，注入到主窗口渲染进程）
//   src/preload/      — preload 脚本（preload-tray.js / preload-main.js / preload-settings.js）
//   main.js           — 入口（本文件：单实例锁 + app 事件 + 启动调度）
// ═══════════════════════════════════════════════════════════════

const { app, globalShortcut } = require('electron')
const { logEvent, bootElapsed, installProcessGuards } = require('./src/state')
const { showWindow } = require('./src/windows')
const { bootstrap, showFatalAndQuit } = require('./src/lifecycle')

// ── 进程级守卫（放最前面，兜住所有未捕获异常） ──
installProcessGuards()
logEvent('app.init', {
  argv0: process.argv0,
  execPath: process.execPath,
  pid: process.pid,
  ppid: process.ppid,
  appPath: app.getAppPath ? app.getAppPath() : null,
  isPackaged: app.isPackaged,
})

// ── 单实例锁 ──
if (!app.requestSingleInstanceLock()) {
  logEvent('app.single-instance-lock.fail', { reason: 'another instance already running' }, 'warn')
  app.quit()
} else {
  logEvent('app.single-instance-lock.ok')
  app.on('second-instance', (_event, argv, workingDir) => {
    logEvent('app.second-instance', { argv, workingDir })
    showWindow()
  })
  app.on('activate', (_event, hasVisibleWindows) => {
    logEvent('app.activate', { hasVisibleWindows })
    showWindow()
  })
  app.on('will-quit', () => {
    logEvent('app.will-quit', { uptimeSec: Math.round(process.uptime()) })
    globalShortcut.unregisterAll()
  })
  app.on('window-all-closed', () => {
    logEvent('app.window-all-closed', { isQuitting: require('./src/state').state.isQuitting })
  })
  app.on('before-quit', (event) => {
    logEvent('app.before-quit', { isQuitting: require('./src/state').state.isQuitting, defaultPrevented: event.defaultPrevented })
  })

  app.whenReady()
    .then(() => {
      logEvent('app.whenReady.ok', { tookMs: bootElapsed() })
      return bootstrap()
    })
    .catch((err) => {
      logEvent('app.whenReady.bootstrap.fail', { err }, 'error')
      return showFatalAndQuit(err)
    })
}