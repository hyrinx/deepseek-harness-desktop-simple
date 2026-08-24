// ═══════════════════════════════════════════════════════════════
// DeepSeek Harness (DSH) 轻量桌面包装 — 主入口
//
// 模块结构：
//   src/constants.js  — 常量与纯工具函数
//   src/state.js      — 全局状态 + 日志基础设施 + 进程守卫
//   src/store.js      — 配置存储（userData/config.json）
//   src/host.js       — Host 子进程管理（spawn / 就绪 / 终止）
//   src/windows.js    — 主窗口 + 设置窗口（创建 / 导航 / 显示切换）
//   src/tray.js       — 托盘与托盘菜单（electron-menubar 封装）
//   src/tray-menu.js  — 托盘菜单 HTML / 尺寸常量
//   src/autostart.js  — 开机自启
//   src/ipc.js        — IPC 处理器 + 全局快捷键
//   src/lifecycle.js  — 生命周期（destroyUI / 退出 / 重启 / 启动）
//   preload/          — preload 脚本（preload.js / preload-settings.js）
//   main.js           — 入口（本文件：单实例锁 + app 事件 + 启动调度）
// ═══════════════════════════════════════════════════════════════

const { app, globalShortcut } = require('electron')
const { logEvent, BOOT, installProcessGuards } = require('./src/state')
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
      logEvent('app.whenReady.ok', { tookMs: Date.now() - BOOT.t0 })
      return bootstrap()
    })
    .catch((err) => {
      logEvent('app.whenReady.bootstrap.fail', { err }, 'error')
      return showFatalAndQuit(err)
    })
}