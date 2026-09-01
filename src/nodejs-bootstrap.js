// ═══════════════════════════════════════════════════════════════
// Node.js 下载与引导（用户手动触发，不自动下载）
//
// 流程：
//   1. 检测全局 node 是否可用
//   2. 若不可用 → 打开设置页，用户选择路径并点击下载
//   3. 下载 zip → 解压 → 安装 → 配置 npm → 设置 PATH
//   4. 通过 IPC 推送进度给渲染进程
// ═══════════════════════════════════════════════════════════════

const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const http = require('node:http')
const { IS_WIN, IS_MAC, IS_LINUX } = require('./constants')
const { logEvent } = require('./state')

const NODE_VERSION = '22'
const NPM_REGISTRY = 'https://registry.npmmirror.com'
const DOWNLOAD_TIMEOUT = 300_000
const MIRROR_BASES = ['https://nodejs.org', 'https://npmmirror.com/mirrors/node']

// ── 平台后缀 ──
function platformSuffix() {
  const a = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (IS_WIN) return `win-${a}`
  if (IS_MAC) return `darwin-${a}`
  return `linux-${a}`
}

// ── 安装路径 ──
let _store = null
function getStore() {
  if (!_store) _store = require('./store').store
  return _store
}

function nodeJsInstallPath() {
  return getStore().get('nodejs.installPath', '') || null
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

// ── 检测全局 Node.js ──
function checkGlobalNode() {
  return new Promise((resolve) => {
    execFile('node', ['--version'], { timeout: 5000, windowsHide: true, shell: IS_WIN },
      (err, stdout) => {
        if (err) {
          logEvent('nodejs-bootstrap.check-global.fail', { err: err.message })
          return resolve({ available: false, version: '', path: '' })
        }
        const version = String(stdout).trim()
        // 获取 node 可执行文件的完整路径
        const whichCmd = IS_WIN ? 'where' : 'which'
        execFile(whichCmd, ['node'], { timeout: 5000, windowsHide: true, shell: IS_WIN },
          (err2, stdout2) => {
            const nodePath = err2 ? '' : String(stdout2).split('\n')[0].trim()
            logEvent('nodejs-bootstrap.check-global.ok', { version, path: nodePath })
            resolve({ available: true, version, path: nodePath })
          })
      })
  })
}

// ── HTTP 请求（HEAD 探测） ──
function headRequest(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const req = protocol.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

// ── HTTP 请求（GET 文本） ──
function getText(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const req = protocol.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

// ── 解析下载地址（优先从 SHASUMS256.txt 获取最新版本，失败则回退探测） ──
async function resolveDownloadUrl(major, suffix) {
  logEvent('nodejs-bootstrap.resolve-download-url.start', { major })
  const re = new RegExp(`node-v(\\d+\\.\\d+\\.\\d+)-${suffix}\\.zip`)

  for (const base of MIRROR_BASES) {
    try {
      const text = await getText(`${base}/dist/latest-v${major}.x/SHASUMS256.txt`)
      const firstLine = text.split('\n')[0]
      const m = firstLine.match(re)
      if (m) {
        const version = `v${m[1]}`
        const url = `${base}/dist/${version}/node-${version}-${suffix}.zip`
        logEvent('nodejs-bootstrap.resolve-download-url.ok', { version, base })
        return { version, url }
      }
    } catch { /* 继续尝试下一个镜像 */ }
  }

  // 回退：探测硬编码的候选版本
  logEvent('nodejs-bootstrap.resolve-download-url.fallback', { major })
  for (const dv of [`v${major}.11.0`, `v${major}.0.0`]) {
    const fn = `node-${dv}-${suffix}.zip`
    for (const base of MIRROR_BASES) {
      const url = `${base}/dist/${dv}/${fn}`
      if (await headRequest(url)) {
        logEvent('nodejs-bootstrap.resolve-download-url.fallback-ok', { version: dv, base })
        return { version: dv, url }
      }
    }
  }

  logEvent('nodejs-bootstrap.resolve-download-url.fail', { major })
  return null
}

// ── 下载文件（带进度） ──
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const req = protocol.get(url, { timeout: DOWNLOAD_TIMEOUT }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const total = parseInt(res.headers['content-length'], 10) || 0
      let downloaded = 0
      const file = fs.createWriteStream(destPath)
      res.on('data', (chunk) => {
        downloaded += chunk.length
        const ok = file.write(chunk)
        if (!ok) res.pause()
        if (onProgress) onProgress({ downloaded, total })
      })
      file.on('drain', () => { res.resume() })
      res.on('end', () => { file.end(); resolve() })
      res.on('error', (err) => { file.close(); reject(err) })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')) })
  })
}

// ── 解压 zip ──
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    if (IS_WIN) {
      execFile('powershell', ['-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`],
        { timeout: 120_000, windowsHide: true }, (err) => {
          if (err) return reject(new Error(`解压失败: ${err.message}`))
          resolve()
        })
    } else if (IS_MAC || IS_LINUX) {
      execFile('unzip', ['-o', zipPath, '-d', destDir],
        { timeout: 120_000 }, (err) => {
          if (err) return reject(new Error(`解压失败: ${err.message}`))
          resolve()
        })
    } else {
      reject(new Error(`不支持的操作系统: ${process.platform}`))
    }
  })
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

  const global = await checkGlobalNode()
  if (global.available) {
    logEvent('nodejs-bootstrap.ensure.skip', { reason: '全局 Node.js 已存在', version: global.version })
    return { installed: false, reason: 'already-available', version: global.version }
  }

  const installPath = nodeJsInstallPath()
  if (!installPath) {
    logEvent('nodejs-bootstrap.ensure.skip', { reason: '用户未配置安装路径' })
    return { installed: false, reason: 'path-not-configured', version: '' }
  }

  const suffix = platformSuffix()
  const globalDir = path.join(installPath, 'node_global')
  const cacheDir = path.join(installPath, 'node_cache')

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
    await downloadFile(downloadUrl, zipPath, (progress) => {
      const pct = progress.total ? Math.round(progress.downloaded / progress.total * 100) : 0
      reportProgress('downloading', {
        message: `正在下载 Node.js ${downloadVersion}...`,
        percent: pct,
        downloaded: progress.downloaded,
        total: progress.total,
      })
    })

    // 解压
    reportProgress('extracting', { message: '正在解压...' })
    const extractDir = path.join(tmpDir, 'extracted')
    fs.mkdirSync(extractDir, { recursive: true })
    await extractZip(zipPath, extractDir)

    const entries = fs.readdirSync(extractDir)
    const topDir = entries.find((e) => fs.statSync(path.join(extractDir, e)).isDirectory())
    if (!topDir) throw new Error('解压后未找到 Node.js 目录')
    const nodeDir = path.join(extractDir, topDir)

    // 安装
    reportProgress('installing', { message: '正在安装...' })
    if (fs.existsSync(installPath)) {
      fs.rmSync(installPath, { recursive: true, force: true })
    }
    fs.mkdirSync(installPath, { recursive: true })

    for (const entry of fs.readdirSync(nodeDir)) {
      fs.cpSync(path.join(nodeDir, entry), path.join(installPath, entry), { recursive: true })
    }

    fs.mkdirSync(globalDir, { recursive: true })
    fs.mkdirSync(cacheDir, { recursive: true })

    // 更新 PATH
    const currentPath = process.env.PATH || ''
    if (!currentPath.includes(installPath)) {
      process.env.PATH = IS_WIN
        ? `${installPath};${globalDir};${currentPath}`
        : `${installPath}/bin:${globalDir}/bin:${currentPath}`
    }
    process.env.NODE_HOME = installPath

    // 配置 npm
    reportProgress('configuring', { message: '正在配置 npm...' })
    const env = { ...process.env, PATH: process.env.PATH }

    for (const cfg of [
      { args: ['config', 'set', 'prefix', globalDir], label: 'prefix' },
      { args: ['config', 'set', 'cache', cacheDir], label: 'cache' },
      { args: ['config', 'set', 'registry', NPM_REGISTRY], label: 'registry' },
    ]) {
      const result = await runNpm(cfg.args, env)
      if (!result.ok) {
        logEvent('nodejs-bootstrap.npm-config.fail', { label: cfg.label, error: result.output }, 'warn')
      } else {
        logEvent('nodejs-bootstrap.npm-config.ok', { label: cfg.label })
      }
    }

    // 验证
    reportProgress('verifying', { message: '正在验证安装...' })
    const verifyResult = await new Promise((resolve) => {
      execFile(path.join(installPath, IS_WIN ? 'node.exe' : 'node'), ['--version'],
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
    const global = await checkGlobalNode()
    const installPath = nodeJsInstallPath()
    const installed = installPath && fs.existsSync(installPath) && fs.existsSync(path.join(installPath, IS_WIN ? 'node.exe' : 'node'))
    return {
      globalAvailable: global.available,
      globalVersion: global.version,
      globalPath: global.path || '',
      localInstalled: Boolean(installed),
      localPath: installPath || '',
      pathConfigured: Boolean(installPath),
    }
  })

  ipcMain.handle('nodejs:get-install-path', () => {
    return { path: nodeJsInstallPath() || '' }
  })

  ipcMain.handle('nodejs:set-install-path', (_e, newPath) => {
    if (!newPath || typeof newPath !== 'string') return false
    getStore().set('nodejs.installPath', newPath.trim())
    logEvent('nodejs-bootstrap.install-path.changed', { path: newPath.trim() })
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
  checkGlobalNode,
  registerNodeJsHandlers,
  nodeJsInstallPath,
  setProgressCallback,
}