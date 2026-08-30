// ═══════════════════════════════════════════════════════════════
// IPC 处理器（统一集中注册，便于审查所有桥接）
// ═══════════════════════════════════════════════════════════════

const { BrowserWindow, shell, app, ipcMain } = require('electron')
const fs = require('node:fs')
const { logEvent } = require('./state')
const { store } = require('./store')
const { logDirPath } = require('./constants')
const { applyAutoStart, readAutoStart } = require('./autostart')
const { registerEnvHandlers } = require('./env')

// ── 全局快捷键 ──

// 渲染进程可写入的快捷键键名白名单（防原型污染 / 越权写入 store 任意路径）
const SHORTCUT_KEYS = new Set(['toggleWindow'])

function registerGlobalShortcut(accelerator) {
  const { globalShortcut } = require('electron')
  logEvent('shortcut.register.start', { accelerator: accelerator || '(empty→unregister)' })
  try {
    globalShortcut.unregisterAll()
    if (!accelerator) {
      logEvent('shortcut.register.unregistered')
      return
    }
    const ok = globalShortcut.register(accelerator, () => {
      logEvent('shortcut.triggered', { accelerator })
      try {
        const { toggleWindow } = require('./windows')
        toggleWindow()
      } catch (err) { logEvent('shortcut.triggered.toggleWindow.fail', { err }, 'error') }
    })
    if (ok) {
      logEvent('shortcut.register.ok', { accelerator })
    } else {
      logEvent('shortcut.register.fail', { accelerator, reason: 'globalShortcut.register returned false' }, 'warn')
    }
  } catch (err) {
    logEvent('shortcut.register.error', { accelerator, err }, 'error')
  }
}

// ── IPC 处理器 ──

function registerIpcHandlers() {
  // 设置相关
  ipcMain.handle('settings:get', () => store.store)

  ipcMain.handle('settings:set-shortcut', (_e, name, value) => {
    if (!SHORTCUT_KEYS.has(name)) {
      logEvent('shortcut.set.invalid', { name }, 'warn')
      return false
    }
    store.set(`shortcuts.${name}`, value)
    registerGlobalShortcut(value)
    return true
  })

  ipcMain.handle('settings:get-autostart', () => readAutoStart())

  ipcMain.handle('settings:set-autostart', (_e, enabled) => {
    const want = Boolean(enabled)
    store.set('ui.autoStart', want)
    return applyAutoStart(want)
  })

  // 应用信息
  ipcMain.handle('get-platform', () => process.platform)
  ipcMain.handle('get-version', () => app.getVersion())

  // 日志相关（单文件 host.log）
  ipcMain.handle('logs:get-info', () => {
    const dir = logDirPath()
    const path = require('./constants').logFilePath()
    let info = { exists: false, size: 0, mtime: null, path, name: 'host.log' }
    try {
      const st = fs.statSync(path)
      info = { exists: true, size: st.size, mtime: st.mtime.toISOString(), path, name: 'host.log' }
    } catch {}
    return { dir, path, info }
  })

  ipcMain.handle('logs:open-folder', async () => {
    const dir = logDirPath()
    try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    await shell.openPath(dir)
    return true
  })

  ipcMain.handle('logs:open-file', async () => {
    const target = require('./constants').logFilePath()
    try {
      if (!fs.existsSync(target)) {
        fs.mkdirSync(logDirPath(), { recursive: true })
        fs.writeFileSync(target, '', 'utf-8')
      }
    } catch (err) {
      console.error('[logs] touch file 失败：', err)
    }
    const result = await shell.openPath(target)
    return { ok: !result, error: result || null, path: target }
  })

  ipcMain.handle('logs:tail', async (_e, maxChars = 32_768) => {
    const target = require('./constants').logFilePath()
    try {
      const st = fs.statSync(target)
      if (st.size <= maxChars) {
        return { ok: true, content: fs.readFileSync(target, 'utf-8'), truncated: false, size: st.size }
      }
      const fd = fs.openSync(target, 'r')
      try {
        const buf = Buffer.alloc(maxChars)
        const offset = Math.max(0, st.size - maxChars)
        fs.readSync(fd, buf, 0, maxChars, offset)
        return { ok: true, content: buf.toString('utf-8'), truncated: true, size: st.size }
      } finally {
        fs.closeSync(fd)
      }
    } catch (err) {
      return { ok: false, error: String(err?.message || err), content: '', truncated: false, size: 0 }
    }
  })

  ipcMain.handle('logs:clear', async () => {
    const target = require('./constants').logFilePath()
    try {
      fs.writeFileSync(target, '', 'utf-8')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  // 环境检测与更新（委托 env.js）
  registerEnvHandlers(ipcMain)

  // 设置向导标记（首次启动后置为 done）
  ipcMain.handle('setup:mark-done', () => {
    store.set('ui.setupDone', true)
    return true
  })

  // 设置覆盖层（注入到主窗口）
  ipcMain.handle('settings:show-overlay', () => {
    const { showSettingsOverlay } = require('./windows')
    showSettingsOverlay()
    return true
  })

  ipcMain.handle('settings:hide-overlay', () => {
    const { hideSettingsOverlay } = require('./windows')
    hideSettingsOverlay()
    return true
  })

  // 窗口拖拽（渲染进程 mousedown/mousemove → IPC 坐标 → 主进程 setBounds）
  //
  // ⚠️ 不能调用 win.setPosition：Electron 在 Windows 下存在核心 bug（#48247 / #9477），
  // 仅设置位置时会把窗口宽高一并篡改（非 100% DPI 缩放下逐次放大窗口）。
  // 官方确认的绕法（见 #48247 评论区）：setBounds 显式携带宽高，宽高取拖拽开始时
  // 的尺寸并在拖拽期间钉住，尺寸永不漂移。渲染端另有 ≥4px 移动阈值（constants.js），
  // 原地长按/单击不会进入拖拽，不产生任何窗口调用。
  let dragWin = null
  let dragBase = null
  let lastSetX = -1, lastSetY = -1

  function stopDrag() {
    dragWin = null
    dragBase = null
    lastSetX = lastSetY = -1
  }

  ipcMain.on('window-drag-start', (event, screenX, screenY) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    stopDrag()
    dragWin = win
    const [wx, wy] = win.getPosition()
    const [ww, wh] = win.getSize() // 钉住当前尺寸，整个拖拽过程保持不变
    dragBase = { x: screenX, y: screenY, baseX: wx, baseY: wy, width: ww, height: wh }
    lastSetX = wx; lastSetY = wy
  })

  ipcMain.on('window-drag-move', (event, screenX, screenY) => {
    if (!dragWin || !dragBase || dragWin.isDestroyed()) return
    const nx = dragBase.baseX + Math.round(screenX - dragBase.x)
    const ny = dragBase.baseY + Math.round(screenY - dragBase.y)
    if (nx === lastSetX && ny === lastSetY) return
    lastSetX = nx; lastSetY = ny
    try {
      dragWin.setBounds({ x: nx, y: ny, width: dragBase.width, height: dragBase.height })
    } catch {
      // 拖拽期间窗口被销毁 → 丢弃本次拖拽，避免异常冒泡触发 uncaughtException 强退
      stopDrag()
    }
  })

  ipcMain.on('window-drag-end', () => {
    stopDrag()
  })

  // 窗口控制
  ipcMain.on('close-window', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // 自绘最小化按钮
  ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  // 自绘最大化按钮：查询当前最大化状态
  ipcMain.handle('window-is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? win.isMaximized() : false
  })

  // 悬浮标题栏双击最大化/还原
  ipcMain.handle('window-toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  // 自动更新
  ipcMain.handle('update:check', async () => {
    const { checkForUpdates, getUpdateState } = require('./updater')
    await checkForUpdates()
    return getUpdateState()
  })

  ipcMain.handle('update:download', async () => {
    const { downloadUpdate, getUpdateState } = require('./updater')
    await downloadUpdate()
    return getUpdateState()
  })

  ipcMain.handle('update:install', async () => {
    const { quitAndInstall } = require('./updater')
    quitAndInstall()
    return true
  })

  ipcMain.handle('update:get-state', () => {
    const { getUpdateState } = require('./updater')
    return getUpdateState()
  })

  ipcMain.handle('update:get-auto-check', () => {
    return store.get('update.autoCheck') !== false
  })

  ipcMain.handle('update:set-auto-check', (_e, enabled) => {
    store.set('update.autoCheck', Boolean(enabled))
    if (enabled) store.set('update.skippedVersion', '')
    logEvent('updater.auto-check.set', { enabled })
  })

  ipcMain.handle('update:get-skipped-version', () => {
    return store.get('update.skippedVersion') || ''
  })

  // 重启 dsh web 子进程并重新导航
  ipcMain.handle('app:restart-dsh', async () => {
    const { restartHost } = require('./host')
    const { navigateMainWindow, showSettingsOverlay } = require('./windows')
    await restartHost()
    await navigateMainWindow()
    showSettingsOverlay()
    return true
  })
}

module.exports = { registerIpcHandlers, registerGlobalShortcut }