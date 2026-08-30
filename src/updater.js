// ═══════════════════════════════════════════════════════════════
// 自动更新（安装版 electron-updater + 便携版手动下载）
//
// 安装版（NSIS）：electron-updater 自动处理，下载安装包 → 静默安装
// 便携版：手动检查 GitHub API → 下载新 .exe → 替换脚本 → 退出
// 开发模式：跳过更新检查
//
// 多源检测：内置多个 GitHub 加速镜像，自动依次尝试，无需用户配置
// ═══════════════════════════════════════════════════════════════

const { app, dialog } = require('electron')
const { logEvent } = require('./state')
const { mode } = require('./env')
const { store } = require('./store')

const UPDATE_REPO = 'hyrinx/deepseek-harness-desktop-simple'
const UPDATE_FEED_URL = `https://github.com/${UPDATE_REPO}`
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`

// 内置镜像源，自动依次尝试
const MIRRORS = [
  'https://ghproxy.com/',
  'https://gh.api.99988866.xyz/',
]

// 简单语义版本比较：a > b 返回 true
function isVersionNewer(a, b) {
  if (!a || !b) return false
  const av = a.split('.').map(Number)
  const bv = b.split('.').map(Number)
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    if ((av[i] || 0) > (bv[i] || 0)) return true
    if ((av[i] || 0) < (bv[i] || 0)) return false
  }
  return false
}

// ── 更新状态（供 UI 读取） ──
const updateState = {
  status: 'idle',           // idle | checking | available | downloading | downloaded | error | no-update
  version: null,            // 新版本号
  downloadedFile: null,     // 下载的文件路径（便携版）
  error: null,              // 错误信息
  progress: 0,              // 下载进度 0-100
  checkTime: null,          // 上次检查时间
}

// 启动时发现更新后的回调（由 lifecycle.js 设置，用于弹窗询问用户）
let _onStartupUpdateAvailable = null

function onStartupUpdateAvailable(cb) {
  _onStartupUpdateAvailable = cb
}

function getUpdateState() {
  return { ...updateState }
}

function setUpdateState(patch) {
  Object.assign(updateState, patch)
  logEvent('updater.state', patch)
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

// ── 便携版：手动下载 ──

const https = require('node:https')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { IS_WIN } = require('./constants')

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const headers = {}
    if (url.includes('api.github.com') || url.includes('github.com')) {
      headers['User-Agent'] = 'DeepSeekHarnessDesktop/' + (app.getVersion ? app.getVersion() : '0.0.0')
    }
    const req = mod.get(url, { timeout: 30_000, headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

// 多源同时检测：所有源并发请求，取最快响应的结果
async function fetchWithFallback(url) {
  const urls = [url, ...MIRRORS.map(function (m) { return m.replace(/\/+$/, '') + '/' + url })]

  try {
    return await Promise.any(urls.map(function (u) { return fetchUrl(u) }))
  } catch (err) {
    logEvent('updater.fetch.all-fail', { url, errs: err.errors && err.errors.map(function (e) { return e.message }) }, 'error')
    throw new Error('所有更新源均不可用，请检查网络连接')
  }
}

async function checkForUpdatesPortable() {
  try {
    setUpdateState({ status: 'checking', error: null, checkTime: new Date().toISOString() })

    // 多源自动检测最新版本
    const apiBuf = await fetchWithFallback(UPDATE_API_URL)
    let releaseData
    try {
      releaseData = JSON.parse(apiBuf.toString('utf-8'))
    } catch {
      setUpdateState({ status: 'error', error: '无法解析 GitHub API 响应' })
      return
    }

    const remoteVersion = (releaseData.tag_name || '').replace(/^v/, '')
    const currentVersion = app.getVersion()

    logEvent('updater.portable.check', { current: currentVersion, remote: remoteVersion })

    if (!remoteVersion) {
      setUpdateState({ status: 'error', error: '无法解析远程版本信息' })
      return
    }

    if (remoteVersion === currentVersion) {
      setUpdateState({ status: 'no-update', version: currentVersion })
      return
    }

    // 语义版本比较
    if (!isVersionNewer(remoteVersion, currentVersion)) {
      setUpdateState({ status: 'no-update', version: currentVersion })
      return
    }

    // 保存 release 数据供下载使用
    updateState._releaseData = releaseData

    setUpdateState({ status: 'available', version: remoteVersion, error: null })
  } catch (err) {
    logEvent('updater.portable.check-fail', { err: err.message }, 'error')
    setUpdateState({ status: 'error', error: err.message })
  }
}

async function downloadUpdatePortable() {
  try {
    const version = updateState.version
    const releaseData = updateState._releaseData
    if (!version) {
      setUpdateState({ status: 'error', error: '没有可用的更新版本' })
      return
    }

    setUpdateState({ status: 'downloading', progress: 0 })

    // 从 release assets 中找到便携版 .exe（不含 "Setup" 的 .exe）
    const assets = releaseData && releaseData.assets ? releaseData.assets : []
    let downloadUrl = null
    let fileName = null

    for (const asset of assets) {
      const name = asset.browser_download_url || ''
      if (name.endsWith('.exe') && !name.includes('Setup')) {
        downloadUrl = asset.browser_download_url
        fileName = asset.name
        break
      }
    }

    if (!downloadUrl) {
      // 回退：使用标准命名格式
      fileName = `DeepSeek Harness Desktop Simple ${version}.exe`
      downloadUrl = `${UPDATE_FEED_URL}/releases/download/v${version}/${encodeURI(fileName)}`
    }

    // 多源自动检测下载
    logEvent('updater.portable.download-start', { url: downloadUrl, fileName })

    // 下载到临时目录
    const tmpDir = require('node:os').tmpdir()
    const destPath = path.join(tmpDir, fileName)

    const buf = await fetchWithFallback(downloadUrl)
    fs.writeFileSync(destPath, buf)

    logEvent('updater.portable.downloaded', { path: destPath, size: buf.length })
    setUpdateState({ status: 'downloaded', downloadedFile: destPath, progress: 100 })
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

  if (IS_WIN) {
    // 创建批处理替换脚本：等待原进程退出 → 替换 exe → 重启新版本
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
  } else {
    // Linux / macOS：shell 替换脚本
    const shPath = path.join(require('node:os').tmpdir(), 'dsh_update.sh')
    const sh = [
      '#!/bin/bash',
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 1; done`,
      `cp -f "${newExe}" "${currentExe}"`,
      `chmod +x "${currentExe}"`,
      `"${currentExe}" &`,
      `rm -f "$0"`,
    ].join('\n')
    fs.writeFileSync(shPath, sh, 'utf-8')
    fs.chmodSync(shPath, 0o755)
    spawn('sh', [shPath], { detached: true, stdio: 'ignore' })
  }

  // 退出当前进程（使用延迟 require 避免循环依赖）
  const { requestQuit } = require('./lifecycle')
  requestQuit()
}

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

async function checkForUpdates() {
  const m = mode()
  logEvent('updater.check.start', { mode: m })

  if (m === 'dev') {
    setUpdateState({ status: 'no-update', version: app.getVersion(), checkTime: new Date().toISOString() })
    return
  }

  if (m === 'installer') {
    await checkForUpdatesInstaller()
  } else if (m === 'portable') {
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

  // 启动时发现新版本，触发回调（弹窗询问用户）
  if (updateState.status === 'available' && _onStartupUpdateAvailable) {
    _onStartupUpdateAvailable(updateState.version)
  }
}

async function downloadUpdate() {
  const m = mode()
  logEvent('updater.download.start', { mode: m })

  if (m === 'installer') {
    return downloadUpdateInstaller()
  }

  if (m === 'portable') {
    return downloadUpdatePortable()
  }
}

function quitAndInstall() {
  const m = mode()
  logEvent('updater.quitAndInstall', { mode: m })

  if (m === 'installer') {
    return quitAndInstallInstaller()
  }

  if (m === 'portable') {
    return quitAndInstallPortable()
  }
}

module.exports = {
  setupUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getUpdateState,
  setUpdateState,
  onStartupUpdateAvailable,
}