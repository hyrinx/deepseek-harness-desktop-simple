// ═══════════════════════════════════════════════════════════════
// 运行时模式检测 + Node.js / npm / dsh 环境检测与更新
//
// 三种运行模式：
//   dev       — 开发模式（electron .），app.isPackaged === false
//   installer — NSIS 安装包，exe 在 Program Files（稳定）
//   portable  — electron-builder portable，exe 解压到 %TEMP% 运行
//                PORTABLE_EXECUTABLE_FILE 指向用户双击的真实 exe（含版本号）
// ═══════════════════════════════════════════════════════════════

const { execFile, spawn } = require('node:child_process')
const { IS_WIN } = require('./constants')

// ═══════════════════════════════════════════════════════════════
// 运行时模式
// ═══════════════════════════════════════════════════════════════

function mode() {
  const { app } = require('electron')
  if (!app.isPackaged) return 'dev'
  if (process.env.PORTABLE_EXECUTABLE_DIR) return 'portable'
  return 'installer'
}

// 真实 exe 路径（稳定，重启后仍有效）
// dev 模式返回 null（调用方用 app.relaunch 默认 execPath）
// 便携版用 PORTABLE_EXECUTABLE_FILE（含版本号文件名，如 "App 1.0.0.exe"），
// 不能用 basename(app.getPath('exe'))，因为内层 exe 名不含版本号
function realExePath() {
  const { app } = require('electron')
  if (!app.isPackaged) return null
  if (process.env.PORTABLE_EXECUTABLE_FILE) return process.env.PORTABLE_EXECUTABLE_FILE
  return app.getPath('exe')
}

// ═══════════════════════════════════════════════════════════════
// 环境检测
// ═══════════════════════════════════════════════════════════════

function runCmd(cmd, args, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    // Windows 上 npm/dsh 是 .cmd 批处理文件，必须 shell:true 才能解析
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, shell: IS_WIN, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: err.message, version: '' })
        resolve({ ok: true, error: '', version: String(stdout).trim() })
      })
  })
}

// 使用 spawn 执行命令，实时推送输出到渲染进程，避免 execFile 缓冲导致的"卡住"体验
function runWithProgress(event, cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, shell: IS_WIN, timeout: timeoutMs })
    let output = ''
    const send = (text) => {
      output += text
      if (event && event.sender && !event.sender.isDestroyed()) {
        event.sender.send('env:progress', text)
      }
    }
    child.stdout.on('data', (data) => send(String(data)))
    child.stderr.on('data', (data) => send(String(data)))
    child.on('error', (err) => {
      send('\n' + err.message + '\n')
      resolve({ ok: false, error: err.message, output })
    })
    child.on('close', (code) => {
      resolve({ ok: code === 0, error: code !== 0 ? 'exit code ' + code : '', output })
    })
  })
}

// 查询 npm 包的最新版本号
function checkLatestNpmPkg(pkgName) {
  return new Promise((resolve) => {
    execFile('npm', ['view', pkgName, 'version'],
      { timeout: 10_000, windowsHide: true, shell: IS_WIN, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve('')
        resolve(String(stdout).trim())
      })
  })
}

async function checkNode() { return runCmd('node', ['--version']) }

async function checkNpm() {
  const [installed, latestVersion] = await Promise.all([
    runCmd('npm', ['--version']),
    checkLatestNpmPkg('npm')
  ])
  return { ...installed, latestVersion }
}

async function checkPnpm() {
  const [installed, latestVersion] = await Promise.all([
    runCmd('pnpm', ['--version']),
    checkLatestNpmPkg('pnpm')
  ])
  return { ...installed, latestVersion }
}

async function checkDsh() {
  const [installed, latestVersion] = await Promise.all([
    runCmd('dsh', ['--version']),
    checkLatestNpmPkg('@deepseek-ai/dsh')
  ])
  return { ...installed, latestVersion }
}
// 检测 dshmarket 插件是否已安装及版本
// 通过 dsh plugin --profile web list 获取已安装插件列表，解析 dshmarket 的版本
// 同时通过 npm view 获取最新版本，用于判断是否需要更新
async function checkPlugin() {
  require('./state').logEvent('env.check-plugin.start')

  const checkInstalled = new Promise((resolve) => {
    execFile('dsh', ['plugin', '--profile', 'web', 'list'],
      { timeout: 15_000, windowsHide: true, shell: IS_WIN, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          require('./state').logEvent('env.check-plugin.fail', { err: err.message }, 'warn')
          return resolve({ installed: false, version: '', error: err.message })
        }
        const output = String(stdout).trim()
        const match = output.match(/dshmarket[@\s]+([\d.]+)/i)
        if (match) {
          const version = match[1]
          require('./state').logEvent('env.check-plugin.ok', { version })
          resolve({ installed: true, version, error: '' })
        } else {
          require('./state').logEvent('env.check-plugin.not-found')
          resolve({ installed: false, version: '', error: '' })
        }
      })
  })

  const checkLatest = new Promise((resolve) => {
    execFile('npm', ['view', 'dshmarket', 'version'],
      { timeout: 10_000, windowsHide: true, shell: IS_WIN, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve('')
        resolve(String(stdout).trim())
      })
  })

  const [installed, latestVersion] = await Promise.all([checkInstalled, checkLatest])
  return { ...installed, latestVersion }
}
async function updateNpm(event) {
  require('./state').logEvent('env.update-npm.start')
  return runWithProgress(event, 'npm', ['install', '-g', 'npm@latest'], 60_000)
}

async function updatePnpm(event) {
  require('./state').logEvent('env.update-pnpm.start')
  return runWithProgress(event, 'npm', ['install', '-g', 'pnpm'], 60_000)
}

async function updateDsh(event) {
  require('./state').logEvent('env.update-dsh.start')
  return runWithProgress(event, 'npm', ['install', '-g', '@deepseek-ai/dsh@latest'], 120_000)
}
// 安装或更新 dshmarket 插件（dsh plugin add 本身支持覆盖安装）
async function updatePlugin(event) {
  require('./state').logEvent('env.update-plugin.start')
  const before = await checkPlugin()
  const beforeVer = before.installed ? before.version : '(未安装)'
  const res = await runWithProgress(event, 'dsh', ['plugin', '--profile', 'web', 'add', 'dshmarket'], 60_000)
  if (!res.ok) {
    require('./state').logEvent('env.update-plugin.fail', { err: res.error }, 'error')
    return { ok: false, error: res.error, output: res.output, beforeVer, afterVer: '' }
  }
  require('./state').logEvent('env.update-plugin.ok', { beforeVer })
  const after = await checkPlugin().catch(() => ({ installed: false, version: '' }))
  return { ok: true, error: '', output: res.output, beforeVer, afterVer: after.installed ? after.version : '' }
}

function registerEnvHandlers(ipcMain) {
  ipcMain.handle('env:check-node', checkNode)
  ipcMain.handle('env:check-npm', checkNpm)
  ipcMain.handle('env:check-pnpm', checkPnpm)
  ipcMain.handle('env:check-dsh', checkDsh)
  ipcMain.handle('env:check-plugin', checkPlugin)
  ipcMain.handle('env:update-npm', (event) => updateNpm(event))
  ipcMain.handle('env:update-pnpm', (event) => updatePnpm(event))
  ipcMain.handle('env:update-dsh', (event) => updateDsh(event))
  ipcMain.handle('env:update-plugin', (event) => updatePlugin(event))
}

module.exports = {
  mode, realExePath,
  checkNode, checkNpm, checkPnpm, checkDsh, checkPlugin,
  updateNpm, updatePnpm, updateDsh, updatePlugin,
  registerEnvHandlers,
}