// ═══════════════════════════════════════════════════════════════
// Host 子进程管理（spawn / 就绪解析 / 终止）
// ═══════════════════════════════════════════════════════════════

const { spawn } = require('node:child_process')
const { app } = require('electron')
const { state, logEvent, logWriter, bootMark } = require('./state')
const { IS_WIN, IS_LINUX, IS_MAC, READINESS_PREFIX, READINESS_TIMEOUT_MS, HOST_STDOUT_TAIL_LIMIT } = require('./constants')

function spawnDshWeb() {
  bootMark('spawn dsh web')
  const cmd = 'dsh'
  const args = ['web', '--host', '127.0.0.1', '--port', '0', '--no-open']
  const opts = {
    cwd: app.getPath('home'),
    env: { ...process.env, DSH_DESKTOP: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: IS_WIN,
    // 非 Windows 下让子进程成为独立进程组组长，使 killHostTree 的
    // process.kill(-pid) 能整组终止（否则 -pid 指向不存在的进程组，会抛 ESRCH）
    detached: !IS_WIN,
  }
  const child = spawn(cmd, args, opts)
  child.once('spawn', () => {
    logEvent('host.spawn', { cmd, args, cwd: opts.cwd, pid: child.pid, shell: IS_WIN })
  })
  child.on('error', (err) => {
    logEvent('host.error', { cmd, args, pid: child.pid, err }, 'error')
  })
  return child
}

function parseReadinessLine(line) {
  if (!line.startsWith(READINESS_PREFIX)) return null
  const token = line.slice(READINESS_PREFIX.length).split(/\s/u, 1)[0]
  let url
  try {
    url = new URL(token)
  } catch {
    throw new Error(`Host 就绪 URL 无效：${token}`)
  }
  const port = Number(url.port)
  const validProtocol = url.protocol === 'http:'
  const validHost = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  const validPath = url.pathname === '/' && url.search === '' && url.hash === ''
  const validPort = Number.isInteger(port) && port >= 1 && port <= 65_535
  if (!validProtocol || !validHost || !validPath || !validPort) {
    throw new Error(`Host 就绪 URL 必须是带显式端口的回环 HTTP 地址：${token}`)
  }
  return url.origin
}

/**
 * 逐行状态机：累积 chunk，按行切割，匹配就绪前缀。
 * 一旦匹配到有效 URL 就返回，后续行继续校验一致性。
 */
function createReadinessParser() {
  let pending = ''
  let readyUrl = null
  return {
    push(chunk) {
      pending += chunk
      for (;;) {
        const newline = pending.indexOf('\n')
        if (newline === -1) return readyUrl
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        const parsed = parseReadinessLine(line)
        if (parsed !== null) {
          if (readyUrl !== null && readyUrl !== parsed) {
            throw new Error(`Host 输出了冲突的就绪 URL：${readyUrl} 与 ${parsed}`)
          }
          readyUrl = parsed
          return readyUrl
        }
      }
    },
  }
}

function appendHostTail(chunk) {
  state.hostStdoutTail = `${state.hostStdoutTail}${chunk}`.slice(-HOST_STDOUT_TAIL_LIMIT)
}

// 兜底强杀：SIGTERM 后 2s 仍存活则升级 SIGKILL（进程组或单进程），避免忽略 SIGTERM 的进程残留
function escalateKill(child, pidTarget) {
  const t = setTimeout(() => {
    if (!child || child.killed) return
    try {
      if (pidTarget) process.kill(pidTarget, 'SIGKILL')
      else child.kill('SIGKILL')
    } catch { /* 进程已退出 */ }
  }, 2000)
  if (t.unref) t.unref()
}

function killHostTree(child) {
  if (!child || child.killed) return
  if (IS_WIN && child.pid) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
      return
    } catch { /* 回退到下方单进程强杀 */ }
  }
  // Linux/macOS：优先杀进程组（spawn 已 detached，-pid 指向进程组）；进程组不存在则回退单进程
  if ((IS_LINUX || IS_MAC) && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
      escalateKill(child, -child.pid)
      return
    } catch { /* 进程组不存在 → 回退单进程 */ }
  }
  child.kill('SIGTERM')
  escalateKill(child, null)
}

function waitForHostReady(child) {
  const parser = createReadinessParser()
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      fail(`Host 就绪超时（${READINESS_TIMEOUT_MS}ms）`)
      killHostTree(child)
    }, READINESS_TIMEOUT_MS)

    function fail(message) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const diagnostic = state.hostStdoutTail ? `\nHost 输出：\n${state.hostStdoutTail}` : ''
      reject(new Error(`${message}${diagnostic}`))
    }

    child.stdout.on('data', (chunk) => {
      appendHostTail(chunk)
      logWriter.write(chunk, 'stdout')
      try {
        const url = parser.push(chunk.toString())
        if (url !== null && !settled) {
          settled = true
          clearTimeout(timer)
          bootMark('host ready')
          resolve(url)
        }
      } catch (error) {
        fail(error.message)
        killHostTree(child)
      }
    })
    child.stderr.on('data', (chunk) => {
      appendHostTail(chunk)
      logWriter.write(chunk, 'stderr')
    })
    child.on('error', (e) => fail(`Host 启动失败：${e.message}`))
    child.on('exit', (code, signal) => {
      const beforeReady = !settled
      const expected = state.isQuitting
      logEvent(
        expected ? 'host.exit.expected' : beforeReady ? 'host.exit.before-ready' : 'host.exit.unexpected',
        { pid: child.pid, code, signal, beforeReady, expected, isQuitting: state.isQuitting },
        expected ? 'info' : 'error',
      )
      if (beforeReady) fail(`Host 在就绪前退出（code ${code}, signal ${signal}）`)
      else if (!expected) {
        logEvent('host.exit.unexpected.console', { code, signal }, 'error')
        // 延迟导入避免循环依赖
        const { requestQuit } = require('./lifecycle')
        requestQuit()
      }
    })
  })
}

function shutdownHost() {
  return new Promise((resolve) => {
    if (!state.host) { logEvent('host.shutdown.noop'); return resolve() }
    const pid = state.host.pid
    const t0 = Date.now()
    logEvent('host.shutdown.start', { pid })
    killHostTree(state.host)
    let done = false
    function finish(reason) {
      if (done) return
      done = true
      logEvent('host.shutdown.done', { pid, tookMs: Date.now() - t0, reason })
      resolve()
    }
    state.host.once('exit', () => finish('exit-event'))
    setTimeout(() => finish('timeout-1500ms'), 1500)
  })
}

module.exports = { spawnDshWeb, waitForHostReady, shutdownHost }