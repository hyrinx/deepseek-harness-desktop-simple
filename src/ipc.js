// ═══════════════════════════════════════════════════════════════
// IPC 处理器（统一集中注册，便于审查所有桥接）
// ═══════════════════════════════════════════════════════════════

const { BrowserWindow, shell, app, ipcMain } = require('electron')
const { basename, join } = require('node:path')
const fs = require('node:fs')
const { logEvent } = require('./state')
const { store } = require('./store')
const { todayStamp, logDirPath } = require('./constants')
const { applyAutoStart } = require('./autostart')

// ── 全局快捷键 ──

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
    store.set(`shortcuts.${name}`, value)
    registerGlobalShortcut(value)
    return true
  })

  ipcMain.handle('settings:get-autostart', () => {
    const pref = store.get('ui.autoStart', false)
    return applyAutoStart(pref)
  })

  ipcMain.handle('settings:set-autostart', (_e, enabled) => {
    const want = Boolean(enabled)
    store.set('ui.autoStart', want)
    return applyAutoStart(want)
  })

  // 应用信息
  ipcMain.handle('get-platform', () => process.platform)
  ipcMain.handle('get-version', () => app.getVersion())

  // 日志相关
  ipcMain.handle('logs:get-info', () => {
    const dir = logDirPath()
    const { recentLogDates } = require('./constants')
    const dates = recentLogDates(7)
    const files = dates.map((stamp) => {
      const p = join(dir, `host-${stamp}.log`)
      try {
        const st = fs.statSync(p)
        return { stamp, exists: true, size: st.size, mtime: st.mtime.toISOString(), path: p, name: basename(p) }
      } catch {
        return { stamp, exists: false, size: 0, mtime: null, path: p, name: `host-${stamp}.log` }
      }
    })
    return { dir, todayStamp: todayStamp(), files }
  })

  ipcMain.handle('logs:open-folder', async () => {
    const dir = logDirPath()
    try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    await shell.openPath(dir)
    return true
  })

  ipcMain.handle('logs:open-file', async (_e, stamp) => {
    const safeStamp = /^\d{4}-\d{2}-\d{2}$/.test(String(stamp || '')) ? String(stamp) : todayStamp()
    const target = join(logDirPath(), `host-${safeStamp}.log`)
    try {
      if (!fs.existsSync(target)) {
        fs.mkdirSync(logDirPath(), { recursive: true })
        fs.writeFileSync(target, `# host-${safeStamp}.log — 暂无输出\n# 日志目录：${logDirPath()}\n`, 'utf-8')
      }
    } catch (err) {
      console.error('[logs] touch file 失败：', err)
    }
    const result = await shell.openPath(target)
    return { ok: !result, error: result || null, path: target }
  })

  ipcMain.handle('logs:tail', async (_e, stamp, maxChars = 32_768) => {
    const safeStamp = /^\d{4}-\d{2}-\d{2}$/.test(String(stamp || '')) ? String(stamp) : todayStamp()
    const target = join(logDirPath(), `host-${safeStamp}.log`)
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

  ipcMain.handle('logs:delete-file', async (_e, stamp) => {
    const safeStamp = /^\d{4}-\d{2}-\d{2}$/.test(String(stamp || '')) ? String(stamp) : null
    if (!safeStamp) return { ok: false, error: 'invalid stamp' }
    const target = join(logDirPath(), `host-${safeStamp}.log`)
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  ipcMain.handle('logs:open-today', async () => {
    const safeStamp = todayStamp()
    const target = join(logDirPath(), `host-${safeStamp}.log`)
    try {
      if (!fs.existsSync(target)) {
        fs.mkdirSync(logDirPath(), { recursive: true })
        fs.writeFileSync(target, `# host-${safeStamp}.log — 暂无输出\n# 日志目录：${logDirPath()}\n`, 'utf-8')
      }
    } catch (err) {
      console.error('[logs] touch today 失败：', err)
    }
    const result = await shell.openPath(target)
    return { ok: !result, error: result || null, path: target }
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
    if (!dragWin || !dragBase) return
    const nx = dragBase.baseX + Math.round(screenX - dragBase.x)
    const ny = dragBase.baseY + Math.round(screenY - dragBase.y)
    if (nx === lastSetX && ny === lastSetY) return
    lastSetX = nx; lastSetY = ny
    dragWin.setBounds({ x: nx, y: ny, width: dragBase.width, height: dragBase.height })
  })

  ipcMain.on('window-drag-end', () => {
    stopDrag()
  })

  // 窗口控制
  ipcMain.on('close-window', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}

module.exports = { registerIpcHandlers, registerGlobalShortcut }