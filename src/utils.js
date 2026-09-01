// ═══════════════════════════════════════════════════════════════
// 通用工具函数（日志文件打开 / 终端打开等）
// ═══════════════════════════════════════════════════════════════

const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { shell } = require('electron')
const { tmpdir } = require('node:os')
const { logEvent } = require('./state')
const { logDirPath, logFilePath, IS_WIN, IS_MAC } = require('./constants')

function openLogFile() {
  const target = logFilePath()
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(logDirPath(), { recursive: true })
      fs.writeFileSync(target, '', 'utf-8')
    }
  } catch (err) {
    console.error('[logs] touch log file 失败：', err)
    logEvent('logs.touch-log.fail', { target, err }, 'error')
  }
  const result = shell.openPath(target)
  if (result) logEvent('logs.open-log.fail', { target, error: result }, 'error')
  else logEvent('logs.open-log.ok', { target })
}

function openTerminal() {
  logEvent('terminal.open')
  try {
    if (IS_WIN) {
      const { join } = require('node:path')
      const tmpDir = tmpdir()
      const histFile = join(tmpDir, 'dsh_cmd_history.txt')
      const ps1Path = join(tmpDir, 'dsh_open_terminal.ps1')
      const ps1 = [
        `$histFile = '${histFile.replace(/'/g, "''")}'`,
        `try { Set-PSReadLineOption -HistorySavePath $histFile -ErrorAction Stop } catch {}`,
        `Write-Host '  ══════════════════════════════════════'`,
        `Write-Host '  常用命令'`,
        `Write-Host '  ══════════════════════════════════════'`,
        `Write-Host '  dsh plugin --profile web add <name>      安装插件'`,
        `Write-Host '  dsh plugin --profile web remove <name>   删除插件'`,
        `Write-Host '  dsh plugin --profile web list              查看插件列表'`,
        `Write-Host '  npm install -g @deepseek-ai/dsh@latest     更新 dsh'`,
        `Write-Host ''`,
        `Write-Host '  (按↑浏览历史命令，自动保存)'`,
        `Write-Host ''`,
      ].join('\n')
      fs.writeFileSync(ps1Path, '\uFEFF' + ps1, 'utf-8')
      spawn(`start "dsh" powershell -NoExit -ExecutionPolicy Bypass -File "${ps1Path}"`, [], {
        shell: true, detached: true, windowsHide: false,
      })
    } else {
      const { join } = require('node:path')
      const tmpDir = tmpdir()
      const shPath = join(tmpDir, IS_MAC ? 'dsh_open_terminal.command' : 'dsh_open_terminal.sh')
      const sh = [
        '#!/bin/bash',
        'cat << \'EOF\'',
        '  ═══════════════════════════════════════',
        '  常用命令',
        '  ═══════════════════════════════════════════',
        '  dsh plugin --profile web add <name>      安装插件',
        '  dsh plugin --profile web remove <name>   删除插件',
        '  dsh plugin --profile web list              查看插件列表',
        '  npm install -g @deepseek-ai/dsh@latest     更新 dsh',
        '',
        '  (按↑浏览历史命令，自动保存)',
        '',
        'EOF',
        'exec $SHELL',
      ].join('\n')
      fs.writeFileSync(shPath, sh, 'utf-8')
      fs.chmodSync(shPath, 0o755)
      if (IS_MAC) {
        spawn('open', ['-a', 'Terminal', shPath], { detached: true })
      } else {
        spawn('x-terminal-emulator', ['-e', shPath], { detached: true })
      }
    }
    logEvent('terminal.open.ok')
  } catch (err) {
    logEvent('terminal.open.fail', { err }, 'error')
  }
}

module.exports = { openLogFile, openTerminal }