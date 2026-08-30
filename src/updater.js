// ═══════════════════════════════════════════════════════════════
// 自动更新（安装版 electron-updater + 便携版 流式下载+校验）
//
// 安装版（NSIS）：electron-updater 自动处理
// 便携版：从 versions.json 发布清单取最新版本 → 流式下载 exe →
//        SHA-256 / 大小 / PE 文件头三重校验 → 退出替换
// 开发模式：默认跳过；设 DSH_UPDATER_TEST=1 可走便携版流程做测试
//
// 多源检测：GitHub 直连 + 内置镜像 + 用户自定义镜像 (config.json#update.mirror)
//          校验通过才算成功，杜绝"把 HTML 错误页当 exe"。
// ═══════════════════════════════════════════════════════════════

const { app, shell } = require('electron')
const https = require('node:https')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { basename } = require('node:path')
const { logEvent } = require('./state')
const { mode } = require('./env')
const { store } = require('./store')
const { IS_WIN } = require('./constants')
const {
  isVersionNewer, normalizeVersion, platformKey, bytesArePe, sha256File, buildMirrorSources,
} = require('./updater-util')

const UPDATE_REPO = 'hyrinx/deepseek-harness-desktop-simple'
const UPDATE_FEED_URL = `https://github.com/${UPDATE_REPO}`
const RELEASE_PAGE = `${UPDATE_FEED_URL}/releases/latest`
// 发布清单：优先读 main 分支根目录 versions.json（直连 + 镜像）
const MANIFEST_URL = `https://raw.githubusercontent.com/${UPDATE_REPO}/main/versions.json`

// 内置镜像源（默认兜底，可被用户配置 mirrors 覆盖/补充）
const BUILTIN_MIRRORS = [
  'https://ghproxy.net/',
  'https://gh-proxy.com/',
  'https://gh.api.99988866.xyz/',
]

// 是否开启"开发模式走便携版更新"的测试开关
function isUpdaterTest() {
  return process.env.DSH_UPDATER_TEST === '1'
}

// ── 更新状态（供 UI 读取） ──
const updateState = {
  status: 'idle',           // idle | checking | available | downloading | verifying | downloaded | error | no-update
  version: null,            // 新版本号
  downloadedFile: null,     // 下载的文件路径（便携版）
  error: null,              // 错误信息
  progress: 0,              // 下载进度 0-100
  size: 0,                  // 待下载文件字节数
  checkTime: null,          // 上次检查时间
}

// 启动时发现更新后的回调（由 lifecycle.js 设置，用于弹窗询问用户）
let _onStartupUpdateAvailable = null
// 状态变化广播（main 进程转给渲染层 + 弹窗流程使用）
let _stateListener = null

function onStartupUpdateAvailable(cb) { _onStartupUpdateAvailable = cb }
function onUpdateStateChange(cb) { _stateListener = cb }

function getUpdateState() { return { ...updateState } }

function setUpdateState(patch) {
  Object.assign(updateState, patch)
  logEvent('updater.state', patch)
  if (_stateListener) {
    try { _stateListener({ ...updateState }) } catch { /* 忽略监听器异常 */ }
  }
}

// ── 安装版：electron-updater ──

let _autoUpdater = null
function getAutoUpdater() {
  if (!_autoUpdater) {
    const { autoUpdater } = require('electron-updater')
    _autoUpdater = autoUpdater
  }
  return _autoUpdater
}

function setupInstallerUpdater() {
  const au = getAutoUpdater()
  au.autoDownload = false
  au.allowDowngrade = false
  au.autoInstallOnAppQuit = true

  au.on('checking-for-update', () => {
    logEvent('updater.installer.checking')
    setUpdateState({ status: 'checking', error: null })
  })
  au.on('update-available', (info) => {
    logEvent('updater.installer.available', { version: info.version })
    setUpdateState({ status: 'available', version: info.version, error: null })
  })
  au.on('update-not-available', (info) => {
    logEvent('updater.installer.not-available', { version: info.version })
    setUpdateState({ status: 'no-update', version: info.version, error: null, checkTime: new Date().toISOString() })
  })
  au.on('download-progress', (progress) => {
    setUpdateState({ progress: Math.round(progress.percent) })
  })
  au.on('update-downloaded', (info) => {
    logEvent('updater.installer.downloaded', { version: info.version, file: info.downloadedFile })
    setUpdateState({ status: 'downloaded', version: info.version, downloadedFile: info.downloadedFile, progress: 100 })
  })
  au.on('error', (err) => {
    logEvent('updater.installer.error', { err: err.message }, 'error')
    setUpdateState({ status: 'error', error: err.message })
  })
}

async function checkForUpdatesInstaller() {
  const au = getAutoUpdater()
  try {
    setUpdateState({ status: 'checking', error: null, checkTime: new Date().toISOString() })
    await au.checkForUpdates()
  } catch (err) {
    logEvent('updater.installer.check-fail', { err: err.message }, 'error')
    setUpdateState({ status: 'error', error: err.message })
  }
}

async function downloadUpdateInstaller() {
  const au = getAutoUpdater()
  try {
    setUpdateState({ status: 'downloading', progress: 0 })
    await au.downloadUpdate()
  } catch (err) {
    logEvent('updater.installer.download-fail', { err: err.message }, 'error')
    setUpdateState({ status: 'error', error: err.message })
  }
}

function quitAndInstallInstaller() {
  const au = getAutoUpdater()
  logEvent('updater.installer.quitAndInstall')
  au.quitAndInstall()
}

// ── 通用 HTTP（小文件取 buffer / 大文件流式写盘） ──

const UA_HEADER = 'DeepSeekHarnessDesktop/' + (app.getVersion ? app.getVersion() : '0.0.0')

function httpGet(url, { timeoutMs = 30_000, onResponse }) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const headers = {}
    if (url.includes('api.github.com') || url.includes('github.com')) headers['User-Agent'] = UA_HEADER
    const req = mod.get(url, { timeout: timeoutMs, headers }, (res) => resolve(res))
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

// 小文件：整体读入内存（用于取 release 清单），拒绝非 JSON 的 HTML 错误页
async function fetchBuffer(url, timeoutMs = 30_000) {
  const res = await httpGet(url, { timeoutMs })
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    res.resume()
    return fetchBuffer(res.headers.location, timeoutMs)
  }
  if (res.statusCode !== 200) {
    res.resume()
    throw new Error(`HTTP ${res.statusCode}`)
  }
  const ct = (res.headers['content-type'] || '').toLowerCase()
  if (ct.includes('text/html')) {
    res.resume()
    throw new Error('服务器返回了网页而非文件(疑似代理错误页)')
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => resolve(Buffer.concat(chunks)))
    res.on('error', reject)
  })
}

// 大文件：流式写盘，边下边算 SHA-256
function downloadToFile(url, destPath, { expectedSize, onProgress, timeoutMs = 120_000 }) {
  return new Promise((resolve, reject) => {
    httpGet(url, { timeoutMs }).then((res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return downloadToFile(res.headers.location, destPath, { expectedSize, onProgress, timeoutMs }).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const ct = (res.headers['content-type'] || '').toLowerCase()
      if (ct.includes('text/html')) {
        res.resume()
        return reject(new Error('服务器返回了网页而非文件(疑似代理错误页)'))
      }
      const len = Number(res.headers['content-length'] || 0)
      if (expectedSize && len && expectedSize > 0 && len !== expectedSize) {
        res.resume()
        return reject(new Error(`文件长度不符(期望${expectedSize}，实际${len})`))
      }
      const hash = crypto.createHash('sha256')
      let received = 0
      const out = fs.createWriteStream(destPath)
      res.on('data', (c) => {
        hash.update(c)
        received += c.length
        if (onProgress) onProgress(received)
      })
      res.on('error', (e) => { out.destroy(); reject(e) })
      out.on('error', reject)
      res.pipe(out)
      out.on('finish', () => resolve({ bytes: received, sha: hash.digest('hex') }))
    }, reject)
  })
}

// 多源竞态（带校验，校验通过才算该源成功）：先原始 URL，再镜像，逐个尝试
async function fetchBufferWithFallback(sources, validate) {
  const errors = []
  for (const url of sources) {
    try {
      const buf = await fetchBuffer(url)
      if (validate && !validate(buf, url)) throw new Error('内容校验未通过(非预期响应)')
      return { url, buf }
    } catch (err) {
      errors.push(`${url}: ${err.message}`)
    }
  }
  throw new Error('所有更新源均不可用。' + errors.join(' | '))
}

// 多源流式下载到文件，校验 大小/SHA-256/PE头，通过才落定正式文件名
async function downloadFileWithFallback(sources, destPath, { expectedSize, expectedSha, onProgress }) {
  const errors = []
  for (const url of sources) {
    const tmp = destPath + '.' + Math.random().toString(36).slice(2) + '.part'
    try {
      const { bytes, sha } = await downloadToFile(url, tmp, { expectedSize, onProgress })
      // PE 文件头校验（'MZ'）
      const mz = Buffer.alloc(2)
      const fd = fs.openSync(tmp, 'r')
      try { fs.readSync(fd, mz, 0, 2, 0) } finally { fs.closeSync(fd) }
      if (!bytesArePe(mz)) throw new Error('下载内容不是有效的可执行文件')
      // SHA-256 校验
      if (expectedSha && sha !== String(expectedSha).toLowerCase()) {
        throw new Error(`校验失败(期望 ${expectedSha}，实际 ${sha})`)
      }
      fs.renameSync(tmp, destPath)
      return { url, file: destPath, bytes, sha }
    } catch (err) {
      errors.push(`${url}: ${err.message}`)
      try { fs.unlinkSync(tmp) } catch { /* 忽略 */ }
    }
  }
  throw new Error('所有下载源均失败。' + errors.join(' | '))
}

// 组装候选源列表（原始 url + 用户镜像 + 内置镜像）
// 用户镜像：config.json 的 update.mirrors 数组，每行一个 URL
// 内置镜像：兜底，用户未配置时使用
function getMirrors() {
  const userMirrors = store.get('update.mirrors', [])
  if (Array.isArray(userMirrors) && userMirrors.length > 0) {
    return userMirrors.filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim())
  }
  return BUILTIN_MIRRORS
}

function buildMirrors(url) {
  const allMirrors = getMirrors()
  return buildMirrorSources(url, {
    userMirror: '',  // 不再使用单值 mirror，走 mirrors 数组
    builtinMirrors: allMirrors,
  })
}

// 获取发布清单：dev 测试模式直接读本地项目根目录 versions.json，否则走远程多源
async function fetchManifest() {
  if (isUpdaterTest()) {
    const localPath = path.join(app.getAppPath(), 'versions.json')
    const txt = fs.readFileSync(localPath, 'utf-8')
    try {
      JSON.parse(txt)
    } catch {
      throw new Error(`本地 versions.json 不是合法 JSON: ${localPath}`)
    }
    return { url: 'local://versions.json', buf: Buffer.from(txt, 'utf-8') }
  }
  return fetchBufferWithFallback(buildMirrors(MANIFEST_URL), (b) => {
    try { return typeof JSON.parse(b.toString('utf-8')) === 'object' } catch { return false }
  })
}

// ── 便携版：清单驱动 ──

async function checkForUpdatesPortable() {
  try {
    setUpdateState({ status: 'checking', error: null, checkTime: new Date().toISOString() })

    // 取发布清单（必须是合法 JSON）
    // dev 测试模式(DSH_UPDATER_TEST=1)：直接读本地项目根目录 versions.json，方便本地改文件联调
    const { url, buf } = await fetchManifest()
    let manifest
    try {
      manifest = JSON.parse(buf.toString('utf-8'))
    } catch {
      setUpdateState({ status: 'error', error: '无法解析更新清单 JSON' })
      return
    }

    const remoteVersion = normalizeVersion(manifest.version)
    const currentVersion = app.getVersion()
    logEvent('updater.portable.check', { current: currentVersion, remote: remoteVersion, via: url })

    if (!remoteVersion) {
      setUpdateState({ status: 'error', error: '更新清单缺少版本号' })
      return
    }
    if (!isVersionNewer(remoteVersion, currentVersion)) {
      setUpdateState({ status: 'no-update', version: currentVersion, checkTime: new Date().toISOString() })
      return
    }

    // 选当前平台想要的资产（优先 portable）
    const key = platformKey()
    const platforms = (manifest.platforms && typeof manifest.platforms === 'object') ? manifest.platforms : {}
    const plat = platforms[key] || platforms['win-x64'] || {}
    const asset = plat.portable || plat.setup
    if (!asset || !asset.url) {
      setUpdateState({ status: 'error', error: `清单中未提供 ${key} 的便携版下载` })
      return
    }

    updateState._manifest = manifest
    updateState._asset = asset
    setUpdateState({ status: 'available', version: remoteVersion, error: null, size: asset.size || 0 })
  } catch (err) {
    logEvent('updater.portable.check-fail', { err: err.message }, 'error')
    setUpdateState({ status: 'error', error: err.message })
  }
}

async function downloadUpdatePortable() {
  const version = normalizeVersion(updateState.version)
  const asset = updateState._asset
  if (!asset) {
    setUpdateState({ status: 'error', error: '没有可用的下载信息，请先检查更新' })
    return
  }

  try {
    setUpdateState({ status: 'downloading', progress: 0 })

    let url = asset.url
    if (!url) {
      url = `${UPDATE_FEED_URL}/releases/download/v${version}/${encodeURI(`DeepSeek Harness Desktop Simple ${version}.exe`)}`
    }
    const fileName = basename(new URL(url).pathname) || `DeepSeek Harness Desktop Simple ${version}.exe`
    const destPath = path.join(require('node:os').tmpdir(), fileName)
    const expectedSize = asset.size || 0
    const expectedSha = (asset.sha256 || '').toLowerCase()

    logEvent('updater.portable.download-start', { url, fileName, size: expectedSize })

    // 校验阶段先预置状态（进度仍可继续显示）
    const { file, bytes, sha } = await downloadFileWithFallback(buildMirrors(url), destPath, {
      expectedSize,
      expectedSha,
      onProgress: (received) => {
        const pct = expectedSize ? Math.min(100, Math.round((received / expectedSize) * 100)) : 0
        setUpdateState({ progress: pct })
      },
    })

    setUpdateState({ status: 'verifying', progress: 100 })

    // 兜底 SHA-256（downloadFileWithFallback 内已校验，这里再做一次全量独立校验）
    const actual = await sha256File(file)
    if (expectedSha && actual !== expectedSha) {
      setUpdateState({ status: 'error', error: `校验失败，文件可能损坏或已被篡改(期望 ${expectedSha}，实际 ${actual})`, progress: 0 })
      return
    }

    logEvent('updater.portable.downloaded', { path: file, size: bytes })
    setUpdateState({ status: 'downloaded', downloadedFile: file, progress: 100, version })
  } catch (err) {
    logEvent('updater.portable.download-fail', { err: err.message }, 'error')
    setUpdateState({ status: 'error', error: err.message })
  }
}

function quitAndInstallPortable() {
  const newExe = updateState.downloadedFile
  const currentExe = process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe')

  if (!newExe || !fs.existsSync(newExe)) {
    logEvent('updater.portable.install-fail', { reason: 'new exe not found', path: newExe }, 'error')
    setUpdateState({ status: 'error', error: '下载文件不存在' })
    return
  }

  logEvent('updater.portable.install', { current: currentExe, new: newExe })

  // 启动独立 worker 进程（纯 Node.js，main 退出后继续运行）
  // 流程：等待 main 退出 → 备份 → 替换 → 启动新版本 → 看门狗 → 回滚或清理
  const workerPath = path.join(__dirname, 'updater-worker.js')
  const args = [
    workerPath,
    String(process.pid),
    String(newExe),
    String(currentExe),
    '10',  // 看门狗超时秒数
  ]

  logEvent('updater.portable.worker-spawn', { workerPath, pid: process.pid })

  try {
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  } catch (err) {
    logEvent('updater.portable.worker-spawn-fail', { err: err.message }, 'error')
    // 兜底：写 bat 脚本
    fallbackBatInstall(currentExe, newExe)
  }

  // 退出当前进程
  const { requestQuit } = require('./lifecycle')
  requestQuit()
}

// 兜底：worker 无法启动时，用传统 bat 脚本
function fallbackBatInstall(currentExe, newExe) {
  if (!IS_WIN) return
  const batPath = path.join(require('node:os').tmpdir(), 'dsh_update.bat')
  const bat = [
    '@echo off',
    'chcp 65001 >nul',
    'echo 正在更新 DeepSeek Harness Desktop...',
    ':wait',
    `tasklist /fi "PID eq ${process.pid}" 2>nul | find "${process.pid}" >nul`,
    'if %errorlevel% equ 0 (',
    '  timeout /t 1 /nobreak >nul',
    '  goto wait',
    ')',
    `echo 替换文件: ${currentExe}`,
    `copy /y "${newExe}" "${currentExe}"`,
    'if %errorlevel% equ 0 (',
    '  echo 更新完成，正在启动新版本...',
    `  start "" "${currentExe}"`,
    '  del "%~f0"',
    ') else (',
    '  echo 更新失败，请手动替换文件',
    '  echo 新文件位于: ' + newExe,
    '  pause',
    ')',
  ].join('\r\n')
  fs.writeFileSync(batPath, '\uFEFF' + bat, 'utf-8')
  spawn('cmd', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: true })
}

// ── 手动下载兜底 ──

function getManualUrl() { return RELEASE_PAGE }
function openManualDownload() { shell.openExternal(getManualUrl()) }

// ── 统一入口 ──

function setupUpdater() {
  const m = mode()
  logEvent('updater.setup', { mode: m })

  if (m === 'dev') {
    logEvent('updater.setup.skip', { reason: 'dev mode' })
    return
  }
  if (m === 'installer') {
    setupInstallerUpdater()
  }
}

async function checkForUpdates({ popup = true } = {}) {
  const m = mode()
  logEvent('updater.check.start', { mode: m, popup })

  // dev 模式：默认真跳过；设 DSH_UPDATER_TEST=1 走便携版流程做测试
  if (m === 'dev' && !isUpdaterTest()) {
    setUpdateState({ status: 'no-update', version: app.getVersion(), checkTime: new Date().toISOString() })
    return
  }

  if (m === 'installer') {
    await checkForUpdatesInstaller()
  } else {
    await checkForUpdatesPortable()
  }

  // 如果更新版本不大于用户跳过的版本，静默忽略
  if (updateState.status === 'available' && updateState.version) {
    const skipped = (store.get('update.skippedVersion') || '').trim()
    if (skipped && !isVersionNewer(updateState.version, skipped)) {
      logEvent('updater.skipped-version', { version: updateState.version, skipped })
      setUpdateState({ status: 'no-update', version: updateState.version })
      return
    }
  }

  // 仅自动检查时弹"发现新版本"框；手动刷新（设置页）靠面板自身展示
  if (popup && updateState.status === 'available' && _onStartupUpdateAvailable) {
    _onStartupUpdateAvailable(updateState.version)
  }
}

async function downloadUpdate() {
  const m = mode()
  logEvent('updater.download.start', { mode: m })

  if (m === 'installer') {
    return downloadUpdateInstaller()
  }
  return downloadUpdatePortable()
}

function quitAndInstall() {
  const m = mode()
  logEvent('updater.quitAndInstall', { mode: m })

  if (m === 'dev') {
    // 开发模式：不实际替换 exe（避免把 electron.exe 覆盖），仅记录
    logEvent('updater.quitAndInstall.skip', { reason: 'dev mode，不做真实替换' }, 'warn')
    return
  }
  if (m === 'installer') {
    return quitAndInstallInstaller()
  }
  return quitAndInstallPortable()
}

module.exports = {
  setupUpdater,
  checkForUpdates, downloadUpdate, quitAndInstall,
  getUpdateState, setUpdateState,
  onStartupUpdateAvailable, onUpdateStateChange,
  getManualUrl, openManualDownload,
  getMirrors,
}