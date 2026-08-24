// ═══════════════════════════════════════════════════════════════
// 全局状态 + 日志基础设施 + 进程守卫
// ═══════════════════════════════════════════════════════════════

const fs = require('node:fs')
const os = require('node:os')
const { todayStamp, logDirPath, logFilePath } = require('./constants')

// ── 日志级别（数值越小越严重） ──
const LOG_LEVEL = Object.freeze({
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
})

const LEVEL_LABEL = ['error', 'warn', 'info', 'debug']

// 发布模式（打包后）只显示 error；开发模式显示 info 及以上
function getMinLogLevel() {
  const { app } = require('electron')
  return app.isPackaged ? LOG_LEVEL.ERROR : LOG_LEVEL.INFO
}

function shouldLog(level) {
  return LOG_LEVEL[level.toUpperCase()] <= getMinLogLevel()
}

// ── 全局状态 ──
const state = {
  mainWindow: null,
  settingsWindow: null,
  tray: null,
  trayMenu: null,
  host: null,
  hostOrigin: null,
  hostStdoutTail: '',
  isQuitting: false,
}

function clearRef(name) {
  if (state[name] && typeof state[name].destroy === 'function') {
    try { state[name].destroy() } catch { /* 忽略已销毁窗口重复调用 */ }
  }
  state[name] = null
}

// ── 启动计时（发布模式下静默） ──
const BOOT = { t0: Date.now() }
function bootMark(label) {
  const t = Date.now() - BOOT.t0
  if (shouldLog('info')) {
    console.log(`[boot] +${String(t).padStart(4)}ms  ${label}`)
  }
  return t
}

// ── 日志写入器（按天切换文件句柄） ──
const logWriter = {
  date: null,
  path: null,
  stream: null,
  ensure(date = new Date()) {
    const stamp = todayStamp(date)
    if (this.date === stamp && this.stream) return this.stream
    if (this.stream) { try { this.stream.end() } catch {} this.stream = null }
    try { fs.mkdirSync(logDirPath(), { recursive: true }) } catch {}
    const path = logFilePath(date)
    const stream = fs.createWriteStream(path, { flags: 'a', encoding: 'utf-8' })
    const header = `\n${'═'.repeat(64)}\n[session] ${new Date().toISOString()}  pid=${process.pid}  platform=${process.platform}  packaged=${require('electron').app.isPackaged}  argv=${JSON.stringify(process.argv)}\n${'─'.repeat(64)}\n`
    stream.write(header)
    this.date = stamp
    this.path = path
    this.stream = stream
    return stream
  },
  write(chunk, kind = 'stdout') {
    try {
      const stream = this.ensure()
      const ts = new Date().toISOString()
      const prefix = chunk.toString().endsWith('\n') ? '' : os.EOL
      stream.write(`[${ts}] [${kind}] ${chunk}${prefix}`)
    } catch (err) {
      console.error('[log-writer] 写入失败：', err)
    }
  },
  close() {
    if (this.stream) { try { this.stream.end() } catch {} this.stream = null }
  },
}

/**
 * 结构化事件日志：统一 [evt] 前缀、可序列化 payload，方便 grep / 统计。
 * 控制台输出受日志级别过滤；文件日志始终全量写入（方便排障）。
 */
function logEvent(event, payload, level = 'info') {
  let body = ''
  if (payload !== undefined && payload !== null) {
    try {
      if (payload instanceof Error) {
        body = ' ' + JSON.stringify({
          name: payload.name,
          message: payload.message,
          stack: payload.stack ? payload.stack.split('\n').slice(0, 8).join(' \\n ') : undefined,
          code: payload.code || undefined,
          errno: payload.errno || undefined,
          syscall: payload.syscall || undefined,
          path: payload.path || undefined,
        })
      } else {
        body = ' ' + JSON.stringify(payload)
      }
    } catch {
      body = ' ' + String(payload)
    }
  }
  const ts = new Date().toISOString()
  const line = `[${ts}] [evt:${level}] ${event}${body}`

  // 控制台输出受日志级别过滤
  if (shouldLog(level)) {
    console[level === 'info' ? 'log' : level](line.replace(/\[evt:/, '['))
  }

  // 文件日志始终全量写入
  try {
    const stream = logWriter.ensure()
    stream.write(line + os.EOL)
  } catch { /* 日志写入器本身失败时不能再抛 */ }
}

/**
 * 进程级全局兜底：未捕获异常 / 未处理 Promise rejection
 */
function installProcessGuards() {
  process.on('uncaughtException', (err, origin) => {
    logEvent('process.uncaughtException', { origin, err }, 'error')
    setTimeout(() => { try { process.exit(1) } catch {} }, 250)
  })
  process.on('unhandledRejection', (reason, promise) => {
    const payload = {
      reason: reason instanceof Error ? reason : String(reason),
      promiseString: String(promise).slice(0, 240),
    }
    logEvent('process.unhandledRejection', payload, 'error')
  })
  process.on('warning', (warn) => {
    logEvent('process.warning', { name: warn.name, message: warn.message, code: warn.code }, 'warn')
  })
  process.on('exit', (code) => {
    logEvent('process.exit', { code, uptimeSec: Math.round(process.uptime()) })
  })
}

module.exports = { state, clearRef, BOOT, bootMark, logWriter, logEvent, installProcessGuards, LOG_LEVEL, shouldLog, getMinLogLevel }