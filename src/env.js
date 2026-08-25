// ═══════════════════════════════════════════════════════════════
// 运行时模式检测 + Node.js / npm / dsh 环境检测与更新
//
// 三种运行模式：
//   dev       — 开发模式（electron .），app.isPackaged === false
//   installer — NSIS 安装包，exe 在 Program Files（稳定）
//   portable  — electron-builder portable，exe 解压到 %TEMP% 运行
//                PORTABLE_EXECUTABLE_FILE 指向用户双击的真实 exe（含版本号）
// ═══════════════════════════════════════════════════════════════

const { execFile } = require('node:child_process')
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

async function checkNode() { return runCmd('node', ['--version']) }
async function checkNpm() { return runCmd('npm', ['--version']) }
async function checkDsh() { return runCmd('dsh', ['--version']) }

async function updateNpm() {
  require('./state').logEvent('env.update-npm.start')
  return new Promise((resolve) => {
    execFile('npm', ['install', '-g', 'npm@latest'],
      { timeout: 60_000, windowsHide: true, shell: IS_WIN, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = (stdout + stderr).trim()
        if (err) {
          require('./state').logEvent('env.update-npm.fail', { err: err.message }, 'error')
          return resolve({ ok: false, error: err.message, output: out })
        }
        require('./state').logEvent('env.update-npm.ok')
        resolve({ ok: true, error: '', output: out })
      })
  })
}

async function updateDsh() {
  require('./state').logEvent('env.update-dsh.start')
  return new Promise((resolve) => {
    execFile('npm', ['install', '-g', '@deepseek-ai/dsh@latest'],
      { timeout: 120_000, windowsHide: true, shell: IS_WIN, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = (stdout + stderr).trim()
        if (err) {
          require('./state').logEvent('env.update-dsh.fail', { err: err.message }, 'error')
          return resolve({ ok: false, error: err.message, output: out })
        }
        require('./state').logEvent('env.update-dsh.ok')
        resolve({ ok: true, error: '', output: out })
      })
  })
}

// 检测 dshmarket 插件是否已安装及版本
// 通过 dsh plugin --profile web list 获取已安装插件列表，解析 dshmarket 的版本
async function checkPlugin() {
  require('./state').logEvent('env.check-plugin.start')
  return new Promise((resolve) => {
    execFile('dsh', ['plugin', '--profile', 'web', 'list'],
      { timeout: 15_000, windowsHide: true, shell: IS_WIN, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          require('./state').logEvent('env.check-plugin.fail', { err: err.message }, 'warn')
          return resolve({ installed: false, version: '', error: err.message })
        }
        const output = String(stdout).trim()
        // 尝试从输出中解析 dshmarket 的版本号
        // 常见格式：dshmarket@x.y.z 或 dshmarket x.y.z
        const match = output.match(/dshmarket[@\s]+([\d.]+)/i)
        if (match) {
          const version = match[1]
          require('./state').logEvent('env.check-plugin.ok', { version })
          resolve({ installed: true, version, error: '' })
        } else {
          // 没有匹配到 dshmarket，视为未安装
          require('./state').logEvent('env.check-plugin.not-found')
          resolve({ installed: false, version: '', error: '' })
        }
      })
  })
}

// 安装或更新 dshmarket 插件（dsh plugin add 本身支持覆盖安装）
async function updatePlugin() {
  require('./state').logEvent('env.update-plugin.start')
  // 先记录当前版本，用于后续对比
  const before = await checkPlugin()
  const beforeVer = before.installed ? before.version : '(未安装)'
  return new Promise((resolve) => {
    execFile('dsh', ['plugin', '--profile', 'web', 'add', 'dshmarket'],
      { timeout: 60_000, windowsHide: true, shell: IS_WIN, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = (stdout + stderr).trim()
        if (err) {
          require('./state').logEvent('env.update-plugin.fail', { err: err.message }, 'error')
          return resolve({ ok: false, error: err.message, output: out, beforeVer, afterVer: '' })
        }
        require('./state').logEvent('env.update-plugin.ok', { beforeVer })
        // 安装成功后回查实际版本，回填 afterVer 供 UI 展示更新结果
        checkPlugin()
          .then((r) => resolve({ ok: true, error: '', output: out, beforeVer, afterVer: r.installed ? r.version : '' }))
          .catch(() => resolve({ ok: true, error: '', output: out, beforeVer, afterVer: '' }))
      })
  })
}

function registerEnvHandlers(ipcMain) {
  ipcMain.handle('env:check-node', checkNode)
  ipcMain.handle('env:check-npm', checkNpm)
  ipcMain.handle('env:check-dsh', checkDsh)
  ipcMain.handle('env:check-plugin', checkPlugin)
  ipcMain.handle('env:update-npm', updateNpm)
  ipcMain.handle('env:update-dsh', updateDsh)
  ipcMain.handle('env:update-plugin', updatePlugin)
}

module.exports = {
  mode, realExePath,
  checkNode, checkNpm, checkDsh, checkPlugin,
  updateNpm, updateDsh, updatePlugin,
  registerEnvHandlers,
}