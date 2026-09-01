// ═══════════════════════════════════════════════════════════════
// 环境检测与更新（Node.js / npm / pnpm / dsh / dshmarket 插件）
//
// 本模块运行在主进程业务域（lifecycle），负责：
//   - 检测本机各运行时是否安装、当前版本
//   - 查询同名 npm 包在镜像 registry 上的最新版本（多 registry 自动降级）
//   - 执行 npm install -g 进行升级，实时推送进度到渲染进程
//   - 统一注册环境相关 IPC 处理器
//
// 纯运行时检测（dev/portable/installer、真实 exe 路径）见 core/runtime.js。
// ═══════════════════════════════════════════════════════════════

const { execFile, spawn } = require('node:child_process')
const { IS_WIN } = require('../core/constants')
const { getJson } = require('../core/net')

// npm 包 registry 镜像（国内优先，官方兜底）
// 走 JSON API 而非本地 `npm view`，不依赖用户本地的 npm 配置与可达性。
const NPM_REGISTRIES = ['https://registry.npmmirror.com', 'https://registry.npmjs.org']

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

// Windows 上 npm/dsh 是 .cmd 批处理文件，必须 shell:true 才能解析
function runCmd(cmd, args, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, shell: IS_WIN, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: err.message, version: '' })
        resolve({ ok: true, error: '', version: String(stdout).trim() })
      })
  })
}

// 查询 npm 包的最新版本号（多 registry 自动降级，返回 '' 表示查询失败）
async function checkLatestNpmPkg(pkgName) {
  for (const registry of NPM_REGISTRIES) {
    try {
      // 形如 https://registry.npmmirror.com/npm/latest → 最新版元数据
      const meta = await getJson(`${registry}/${encodeURIComponent(pkgName)}/latest`, { timeout: 15_000 })
      const version = String((meta && (meta.version || (meta['dist-tags'] && meta['dist-tags'].latest))) || '').trim()
      if (version) return version
    } catch { /* 该镜像不可达 → 尝试下一个 */ }
  }
  return ''
}

async function checkNode() {
  const result = await runCmd('node', ['--version'])
  if (!result.ok) return { ...result, path: '' }
  // 获取 node 可执行文件的完整路径
  const pathResult = await new Promise((resolve) => {
    const whichCmd = IS_WIN ? 'where' : 'which'
    execFile(whichCmd, ['node'], { timeout: 5000, windowsHide: true, shell: IS_WIN },
      (err, stdout) => {
        resolve(err ? '' : String(stdout).split('\n')[0].trim())
      })
  })
  return { ...result, path: pathResult }
}

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
  const checkInstalled = new Promise((resolve) => {
    execFile('dsh', ['plugin', '--profile', 'web', 'list'],
      { timeout: 15_000, windowsHide: true, shell: IS_WIN, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          return resolve({ installed: false, version: '', error: err.message })
        }
        const output = String(stdout).trim()
        const match = output.match(/dshmarket[@\s]+([\d.]+)/i)
        if (match) {
          resolve({ installed: true, version: match[1], error: '' })
        } else {
          resolve({ installed: false, version: '', error: '' })
        }
      })
  })

  const [installed, latestVersion] = await Promise.all([
    checkInstalled,
    checkLatestNpmPkg('dshmarket'),
  ])
  return { ...installed, latestVersion }
}

async function updateNpm(event) {
  return runWithProgress(event, 'npm', ['install', '-g', 'npm@latest'], 60_000)
}

async function updatePnpm(event) {
  return runWithProgress(event, 'npm', ['install', '-g', 'pnpm'], 60_000)
}

async function updateDsh(event) {
  return runWithProgress(event, 'npm', ['install', '-g', '@deepseek-ai/dsh@latest'], 120_000)
}

async function updatePlugin(event) {
  const before = await checkPlugin()
  const beforeVer = before.installed ? before.version : '(未安装)'
  const res = await runWithProgress(event, 'dsh', ['plugin', '--profile', 'web', 'add', 'dshmarket'], 60_000)
  if (!res.ok) {
    return { ok: false, error: res.error, output: res.output, beforeVer, afterVer: '' }
  }
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
  checkNode, checkNpm, checkPnpm, checkDsh, checkPlugin,
  updateNpm, updatePnpm, updateDsh, updatePlugin,
  registerEnvHandlers,
}