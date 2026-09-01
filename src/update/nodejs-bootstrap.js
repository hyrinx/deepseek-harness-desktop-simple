// ═══════════════════════════════════════════════════════════════
// Node.js 下载与引导（用户手动触发，不自动下载）
//
// 流程：
//   1. 检测全局 node 是否可用
//   2. 若不可用 → 打开设置页，用户选择路径并点击下载
//   3. 下载 zip → 解压 → 安装 → 配置 npm → 设置 PATH（进程 + 系统）
//   4. 通过 IPC 推送进度给渲染进程
// ═══════════════════════════════════════════════════════════════

const { execFile } = require('node:child_process')
const { dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { IS_WIN, IS_MAC, IS_LINUX } = require('../core/constants')
const { logEvent } = require('../core/state')
const { fetchBuffer, headAvailable } = require('../core/net')

const { checkNode } = require('../lifecycle/env')

// Node.js 主版本：安装时自动解析该大版本下的最新 patch
const NODE_VERSION = '22'
// 默认 npm registry（国内），配合 node_global 全局装包
const NPM_REGISTRY = 'https://registry.npmmirror.com'
// 单次下载超时（Node 解压包较大，放宽到 10 分钟）
const DOWNLOAD_TIMEOUT = 10 * 60_000
// Node.js 下载镜像（国内优先，官方兜底）；逐个尝试，自动降级
const MIRROR_BASES = ['https://npmmirror.com/mirrors/node', 'https://nodejs.org']

// ── 平台后缀 ──
function platformSuffix() {
  const a = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (IS_WIN) return `win-${a}`
  if (IS_MAC) return `darwin-${a}`
  return `linux-${a}`
}

// ── 让出事件循环，允许渲染进程更新 UI ──
function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve))
}

// ── 写入系统环境变量（Windows 注册表 HKCU\Environment） ──
function writeSystemEnvWin(nodeBinPath, globalDir) {
  return new Promise((resolve) => {
    const psScript = [
      `$nodeBin = '${nodeBinPath.replace(/'/g, "''")}'`,
      `$globalDir = '${globalDir.replace(/'/g, "''")}'`,
      `[Environment]::SetEnvironmentVariable('NODE_HOME', $nodeBin, 'User')`,
      `$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')`,
      `if ($currentPath -notlike "*$nodeBin*") {`,
      `  $newPath = "$nodeBin;$globalDir;$currentPath"`,
      `  [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')`,
      `}`,
    ].join('; ')
    execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 15000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          logEvent('nodejs-bootstrap.system-env.fail', { err: err.message, stderr }, 'warn')
          return resolve(false)
        }
        logEvent('nodejs-bootstrap.system-env.ok', { nodeBinPath, globalDir })
        resolve(true)
      })
  })
}

// ── 安装路径（内存变量，不持久化） ──
// _installPath 是用户选择的父目录，实际 Node.js 二进制文件安装在 _installPath/nodejs 子目录中
let _installPath = null

function nodeJsInstallPath() {
  return _installPath
}

function nodeJsBinPath() {
  if (!_installPath) return null
  const normalized = _installPath.replace(/[/\\]+$/, '')
  const lower = normalized.toLowerCase()
  if (lower.endsWith('nodejs')) {
    return normalized
  }
  return path.join(normalized, 'nodejs')
}

// ── 进度回调 ──
let progressCallback = null

function setProgressCallback(cb) {
  progressCallback = cb
}

function reportProgress(stage, detail) {
  logEvent('nodejs-bootstrap.progress', { stage, ...detail })
  if (progressCallback) {
    try { progressCallback(stage, detail) } catch { /* ignore */ }
  }
}

// ── GET 文本（拉取 SHASUMS256.txt / 版本目录清单） ──
async function getText(url, timeout = 20_000) {
  const { buffer } = await fetchBuffer(url, { timeout })
  return buffer.toString('utf-8')
}

// ── 解析下载地址 ──
// 优先从各镜像的 SHASUMS256.txt 解析大版本下的最新 patch；
// 全失败则回退：用候选版本 + HEAD 探测镜像上是否存在对应 zip。
// 两层都依赖镜像数组 MIRROR_BASES 自动降级。
async function resolveDownloadUrl(major, suffix) {
  logEvent('nodejs-bootstrap.resolve-download-url.start', { major })
  const re = new RegExp(`node-v(\\d+\\.\\d+\\.\\d+)-${suffix}\\.zip`)

  // 第一层：SHASUMS256.txt 精确拿最新版本
  for (const base of MIRROR_BASES) {
    try {
      const text = await getText(`${base}/dist/latest-v${major}.x/SHASUMS256.txt`)
      const m = text.split('\n')[0].match(re)
      if (m) {
        const version = `v${m[1]}`
        const url = `${base}/dist/${version}/node-${version}-${suffix}.zip`
        logEvent('nodejs-bootstrap.resolve-download-url.ok', { version, base })
        return { version, url }
      }
    } catch { /* 该镜像不可达或响应异常 → 尝试下一个 */ }
  }

  // 第二层：候选版本 + HEAD 探测兜底
  logEvent('nodejs-bootstrap.resolve-download-url.fallback', { major })
  for (const dv of [`v${major}.11.0`, `v${major}.0.0`]) {
    const fn = `node-${dv}-${suffix}.zip`
    for (const base of MIRROR_BASES) {
      const url = `${base}/dist/${dv}/${fn}`
      if (await headAvailable(url)) {
        logEvent('nodejs-bootstrap.resolve-download-url.fallback-ok', { version: dv, base })
        return { version: dv, url }
      }
    }
  }

  logEvent('nodejs-bootstrap.resolve-download-url.fail', { major })
  return null
}

// ── 下载（复用统一网络层 fetchBuffer，自动跟随重定向/统一超时/可读证书报错） ──
async function downloadNodeZip(url, onProgress) {
  const { buffer } = await fetchBuffer(url, { timeout: DOWNLOAD_TIMEOUT, onProgress })
  return buffer
}

// ── 解压 zip（adm-zip，零依赖纯 JS） ──
const AdmZip = require('adm-zip')

function extractZip(zipPath, destDir) {
  logEvent('nodejs-bootstrap.extract.start', { zipPath, destDir })
  try {
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(destDir, true)
    const topFiles = fs.readdirSync(destDir)
    logEvent('nodejs-bootstrap.extract.ok', { destDir, fileCount: topFiles.length })
  } catch (err) {
    logEvent('nodejs-bootstrap.extract.fail', { err: err.message }, 'error')
    throw new Error(`解压失败: ${err.message}`)
  }
}

// ── 运行 npm 命令 ──
function runNpm(args, env) {
  return new Promise((resolve) => {
    execFile('npm', args, { timeout: 30_000, windowsHide: true, shell: IS_WIN, env },
      (err, stdout, stderr) => {
        if (err) {
          logEvent('nodejs-bootstrap.npm.fail', { args, err: err.message, stderr }, 'warn')
          return resolve({ ok: false, error: err.message, output: stderr })
        }
        resolve({ ok: true, error: '', output: stdout })
      })
  })
}

// ── 主流程 ──
async function ensureNodeJs() {
  logEvent('nodejs-bootstrap.ensure.start')

  const global = await checkNode()
  if (global.ok) {
    logEvent('nodejs-bootstrap.ensure.skip', { reason: '全局 Node.js 已存在', version: global.version })
    return { installed: false, reason: 'already-available', version: global.version }
  }

  const installPath = nodeJsInstallPath()
  if (!installPath) {
    logEvent('nodejs-bootstrap.ensure.skip', { reason: '用户未配置安装路径' })
    return { installed: false, reason: 'path-not-configured', version: '' }
  }

  const suffix = platformSuffix()
  const nodeBinPath = nodeJsBinPath()
  const globalDir = path.join(nodeBinPath, 'node_global')
  const cacheDir = path.join(nodeBinPath, 'node_cache')

  // 确定下载版本
  reportProgress('resolving', { message: '正在查询最新版本...' })
  const resolved = await resolveDownloadUrl(NODE_VERSION, suffix)
  if (!resolved) {
    const err = new Error(`无法找到 Node.js v${NODE_VERSION} 的可用版本`)
    logEvent('nodejs-bootstrap.ensure.fail', { err: err.message }, 'error')
    throw err
  }

  const downloadVersion = resolved.version
  const downloadUrl = resolved.url
  const fn = `node-${downloadVersion}-${suffix}.zip`

  logEvent('nodejs-bootstrap.download-version', { version: downloadVersion, url: downloadUrl })

  // 下载
  reportProgress('downloading', { message: `正在下载 Node.js ${downloadVersion}...`, version: downloadVersion })
  const tmpDir = path.join(os.tmpdir(), `dsh-nodejs-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const zipPath = path.join(tmpDir, fn)

  try {
    const zipBuffer = await downloadNodeZip(downloadUrl, (progress) => {
      const pct = progress.total ? Math.round(progress.received / progress.total * 100) : 0
      reportProgress('downloading', {
        message: `正在下载 Node.js ${downloadVersion}...`,
        percent: pct,
        downloaded: progress.received,
        total: progress.total,
      })
    })
    fs.writeFileSync(zipPath, zipBuffer)

    // 解压
    reportProgress('extracting', { message: '正在解压...' })
    await yieldToEventLoop()
    const extractDir = path.join(tmpDir, 'extracted')
    fs.mkdirSync(extractDir, { recursive: true })
    extractZip(zipPath, extractDir)
    await yieldToEventLoop()

    const entries = fs.readdirSync(extractDir)
    const topDir = entries.find((e) => fs.statSync(path.join(extractDir, e)).isDirectory())
    if (!topDir) throw new Error('解压后未找到 Node.js 目录')
    const nodeDir = path.join(extractDir, topDir)

    // 安装
    reportProgress('installing', { message: '正在安装...' })
    await yieldToEventLoop()
    if (fs.existsSync(nodeBinPath)) {
      fs.rmSync(nodeBinPath, { recursive: true, force: true })
    }
    fs.mkdirSync(nodeBinPath, { recursive: true })

    for (const entry of fs.readdirSync(nodeDir)) {
      fs.cpSync(path.join(nodeDir, entry), path.join(nodeBinPath, entry), { recursive: true })
    }

    fs.mkdirSync(globalDir, { recursive: true })
    fs.mkdirSync(cacheDir, { recursive: true })
    await yieldToEventLoop()

    // 更新 PATH（进程内）
    const currentPath = process.env.PATH || ''
    if (!currentPath.includes(nodeBinPath)) {
      process.env.PATH = IS_WIN
        ? `${nodeBinPath};${globalDir};${currentPath}`
        : `${nodeBinPath}/bin:${globalDir}/bin:${currentPath}`
    }
    process.env.NODE_HOME = nodeBinPath

    // 写入系统环境变量（Windows 注册表，持久化）
    if (IS_WIN) {
      reportProgress('configuring', { message: '正在写入系统环境变量...' })
      await writeSystemEnvWin(nodeBinPath, globalDir)
    }

    // 配置 npm
    reportProgress('configuring', { message: '正在配置 npm...' })
    await yieldToEventLoop()
    const env = { ...process.env, PATH: process.env.PATH }

    for (const cfg of [
      { args: ['config', 'set', 'prefix', globalDir], label: 'prefix' },
      { args: ['config', 'set', 'cache', cacheDir], label: 'cache' },
      { args: ['config', 'set', 'registry', NPM_REGISTRY], label: 'registry' },
    ]) {
      reportProgress('configuring', { message: `正在配置 npm ${cfg.label}...` })
      await yieldToEventLoop()
      const result = await runNpm(cfg.args, env)
      if (!result.ok) {
        logEvent('nodejs-bootstrap.npm-config.fail', { label: cfg.label, error: result.output }, 'warn')
      } else {
        logEvent('nodejs-bootstrap.npm-config.ok', { label: cfg.label })
      }
    }
    await yieldToEventLoop()

    // 验证
    reportProgress('verifying', { message: '正在验证安装...' })
    await yieldToEventLoop()
    const verifyResult = await new Promise((resolve) => {
      execFile(path.join(nodeBinPath, IS_WIN ? 'node.exe' : 'node'), ['--version'],
        { timeout: 10000, windowsHide: true, env },
        (err, stdout) => {
          if (err) return resolve({ ok: false, error: err.message })
          resolve({ ok: true, version: String(stdout).trim() })
        })
    })

    if (!verifyResult.ok) {
      throw new Error(`Node.js 安装验证失败: ${verifyResult.error}`)
    }

    logEvent('nodejs-bootstrap.ensure.ok', {
      version: verifyResult.version,
      installPath,
      globalDir,
      cacheDir,
    })

    reportProgress('done', {
      message: `Node.js ${verifyResult.version} 安装完成`,
      version: verifyResult.version,
      installPath,
    })

    return { installed: true, version: verifyResult.version, installPath, globalDir, cacheDir }

  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ── IPC 注册 ──
function registerNodeJsHandlers(ipcMain) {
  ipcMain.handle('nodejs:status', async () => {
    const global = await checkNode()
    const installPath = nodeJsInstallPath()
    const binPath = nodeJsBinPath()
    const installed = binPath && fs.existsSync(binPath) && fs.existsSync(path.join(binPath, IS_WIN ? 'node.exe' : 'node'))
    return {
      globalAvailable: global.ok,
      globalVersion: global.version,
      globalPath: global.path || '',
      localInstalled: Boolean(installed),
      localPath: binPath || '',
      pathConfigured: Boolean(installPath),
    }
  })

  ipcMain.handle('nodejs:get-install-path', () => {
    return { path: nodeJsInstallPath() || '' }
  })

  ipcMain.handle('nodejs:select-install-path', async (_e, currentPath) => {
    const result = await dialog.showOpenDialog({
      title: '选择 Node.js 安装位置',
      defaultPath: currentPath || '',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { path: null }
    }
    return { path: result.filePaths[0] }
  })

  ipcMain.handle('nodejs:set-install-path', (_e, newPath) => {
    if (!newPath || typeof newPath !== 'string') return false
    _installPath = newPath.trim()
    logEvent('nodejs-bootstrap.install-path.changed', { path: _installPath })
    return true
  })

  // 从设置页触发下载
  ipcMain.handle('nodejs:start-download', async () => {
    try {
      return await ensureNodeJs()
    } catch (err) {
      logEvent('nodejs-bootstrap.start-download.fail', { err: err.message }, 'error')
      reportProgress('error', { message: err.message })
      return { installed: false, reason: 'error', error: err.message, version: '' }
    }
  })

  // 进度回调注册
  ipcMain.on('nodejs:set-progress-callback', (event) => {
    setProgressCallback((stage, detail) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('nodejs:progress', { stage, ...detail })
      }
    })
  })
}

module.exports = {
  registerNodeJsHandlers,
  nodeJsInstallPath,
  nodeJsBinPath,
  setProgressCallback,
}