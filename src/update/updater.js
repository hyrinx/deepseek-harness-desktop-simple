// ═══════════════════════════════════════════════════════════════
// 自动更新（安装版 electron-updater + 便携版手动下载）
//
// 安装版（NSIS）：electron-updater 自动处理，下载安装包 → 静默安装
// 便携版 / 开发模式：手动检查更新接口 → 下载新 .exe → 替换脚本 → 退出
//
// 版本探测与多源降级收敛到 update-sources.js；
// 所有 HTTP(S) 请求收敛到 net.js（统一超时 / 重定向 / 证书可读报错）。
// 更新源：Gitee 优先，GitHub 兜底，不再依赖任何第三方镜像。
// ═══════════════════════════════════════════════════════════════

const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { logEvent } = require('../core/state')
const { mode } = require('../core/runtime')
const { store } = require('../core/store')
const { IS_WIN } = require('../core/constants')
const { fetchBuffer } = require('../core/net')
const {
  SOURCES, isVersionNewer, downloadUrlFor, probeLatestRelease,
} = require('./update-sources')

// ── 更新状态（供 UI 读取） ──
const updateState = {
  status: 'idle',           // idle | checking | available | downloading | downloaded | error | no-update
  version: null,            // 新版本号
  downloadedFile: null,     // 下载的文件路径
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
    setUpdateState({ status: 'checking', error: null })
  })

  au.on('update-available', (info) => {
    setUpdateState({ status: 'available', version: info.version, error: null })
  })

  au.on('update-not-available', (info) => {
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

    // 优先探测源（Gitee → GitHub），并把 electron-updater 指向命中源
    const { source, tag } = await probeLatestRelease()

    if (source === 'gitee') {
      // Gitee 用 generic provider：指向该版本 release 资产目录（含 latest.yml）
      const feed = SOURCES.find((s) => s.name === 'gitee').feed
      const url = `${feed}/releases/download/${tag}`
      au.setFeedURL({ provider: 'generic', url })
      logEvent('updater.installer.feed', { source, url })
    } else {
      // GitHub 走原生 provider（由 package.json publish 提供 owner/repo）
      au.setFeedURL({ provider: 'github', owner: 'hyrinx', repo: 'deepseek-harness-desktop-simple' })
      logEvent('updater.installer.feed', { source })
    }

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

/**
 * 下载指定 tag 下的资产文件（跨源降级）。
 * 优先尝试 preferredSource，失败则依次尝试其余源。
 * @returns {Promise<{source, buffer, url}>}
 */
async function downloadReleaseAsset(preferredSource, tag, fileName, onProgress) {
  const ordered = [...SOURCES].sort((a, b) => {
    if (a.name === preferredSource) return -1
    if (b.name === preferredSource) return 1
    return 0
  })
  let lastErr
  for (const src of ordered) {
    const url = downloadUrlFor(src.name, tag, fileName)
    try {
      const { buffer } = await fetchBuffer(url, { timeout: 5 * 60_000, onProgress })
      logEvent('updater.portable.download-ok', { source: src.name, url, size: buffer.length })
      return { source: src.name, buffer, url }
    } catch (e) {
      logEvent('updater.portable.download-source-fail', { source: src.name, err: e.message }, 'warn')
      lastErr = e
    }
  }
  throw lastErr || new Error('所有更新源下载均失败')
}

async function checkForUpdatesPortable() {
  try {
    setUpdateState({ status: 'checking', error: null, checkTime: new Date().toISOString() })

    // 按优先级（Gitee → GitHub）自动检测最新版本
    const probe = await probeLatestRelease()
    const remoteVersion = probe.version
    const currentVersion = app.getVersion()

    logEvent('updater.portable.check', { source: probe.source, current: currentVersion, remote: remoteVersion })

    if (!remoteVersion) {
      setUpdateState({ status: 'error', error: '无法解析远程版本信息' })
      return
    }

    if (remoteVersion === currentVersion || !isVersionNewer(remoteVersion, currentVersion)) {
      setUpdateState({ status: 'no-update', version: currentVersion })
      return
    }

    // 保存探测结果供下载使用
    updateState._probe = probe

    setUpdateState({ status: 'available', version: remoteVersion, error: null })
  } catch (err) {
    logEvent('updater.portable.check-fail', { err: err.message }, 'error')
    setUpdateState({ status: 'error', error: err.message })
  }
}

async function downloadUpdatePortable() {
  try {
    const version = updateState.version
    const probe = updateState._probe
    if (!version) {
      setUpdateState({ status: 'error', error: '没有可用的更新版本' })
      return
    }
    const releaseTag = probe ? probe.tag : `v${version}`
    const release = probe ? probe.release : null
    const source = probe ? probe.source : null

    setUpdateState({ status: 'downloading', progress: 0 })

    // 从 release assets 中找到便携版 .exe（不含 "Setup" 的 .exe）
    const assets = release && Array.isArray(release.assets) ? release.assets : []
    let fileName = null
    for (const asset of assets) {
      const name = asset.browser_download_url || ''
      if (name.endsWith('.exe') && !name.includes('Setup')) {
        fileName = asset.name
        break
      }
    }
    if (!fileName) {
      fileName = `DeepSeek Harness Desktop Simple ${version}.exe`
    }

    const tmpDir = require('node:os').tmpdir()
    const destPath = path.join(tmpDir, fileName)

    const { buffer } = await downloadReleaseAsset(source, releaseTag, fileName, (p) => {
      const pct = p.total ? Math.round((p.received / p.total) * 100) : 0
      setUpdateState({ progress: pct })
    })

    fs.writeFileSync(destPath, buffer)

    logEvent('updater.portable.downloaded', { path: destPath, size: buffer.length })
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
  const { requestQuit } = require('../lifecycle/lifecycle')
  requestQuit()
}

// ── 统一入口 ──

function setupUpdater() {
  const m = mode()
  if (m === 'installer') {
    setupInstallerUpdater()
  }
}

async function checkForUpdates() {
  const m = mode()

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

  // 启动时发现新版本，触发回调（弹窗询问用户）
  if (updateState.status === 'available' && _onStartupUpdateAvailable) {
    _onStartupUpdateAvailable(updateState.version)
  }
}

async function downloadUpdate() {
  const m = mode()

  if (m === 'installer') {
    return downloadUpdateInstaller()
  }

  return downloadUpdatePortable()
}

function quitAndInstall() {
  const m = mode()

  if (m === 'installer') {
    return quitAndInstallInstaller()
  }

  return quitAndInstallPortable()
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