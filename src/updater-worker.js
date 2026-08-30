// ═══════════════════════════════════════════════════════════════
// 独立更新进程（由主进程 spawn，主进程退出后继续运行）
//
// 流程：
//   1. 等待父进程 PID 退出
//   2. 备份旧 exe → 旧 exe.backup
//   3. 复制新 exe → 旧 exe 位置
//   4. 启动新 exe + 看门狗验证（最多等 10 秒）
//   5. 验证通过 → 删备份，退出
//   6. 验证失败 → 恢复备份，弹错误提示
//
// 纯 Node.js，不依赖 Electron。
// 参数：node updater-worker.js <parentPid> <newExe> <currentExe> [watchdogSec]
// ═══════════════════════════════════════════════════════════════

const fs = require('node:fs')
const path = require('node:path')
const { spawn, execSync } = require('node:child_process')

const LOG_FILE = path.join(require('node:os').tmpdir(), 'dsh_updater.log')

function log(msg) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}\n`
  try { fs.appendFileSync(LOG_FILE, line, 'utf-8') } catch { /* 忽略 */ }
}

function fail(msg) {
  log('FAIL: ' + msg)
  // 弹错误框（Windows）
  try {
    const vbs = path.join(require('node:os').tmpdir(), 'dsh_updater_fail.vbs')
    fs.writeFileSync(vbs, `MsgBox "${msg.replace(/"/g, '""')}", 16, "更新失败"`, 'utf-8')
    spawn('wscript', [vbs], { detached: true, stdio: 'ignore' })
  } catch { /* 忽略 */ }
  process.exit(1)
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function isProcessAlive(pid) {
  try {
    // Windows: tasklist 查询
    const out = execSync(`tasklist /fi "PID eq ${pid}" /fo csv /nh`, {
      encoding: 'utf-8',
      timeout: 3000,
      windowsHide: true,
    })
    return out.includes(String(pid))
  } catch {
    return false
  }
}

async function waitForParentExit(pid) {
  log(`等待父进程 ${pid} 退出...`)
  for (let i = 0; i < 60; i++) {
    if (!isProcessAlive(pid)) {
      log(`父进程 ${pid} 已退出 (耗时 ${i}s)`)
      return
    }
    await sleep(1000)
  }
  fail(`父进程 ${pid} 60 秒内未退出，放弃更新`)
}

async function main() {
  const args = process.argv.slice(2)
  const parentPid = Number(args[0])
  const newExe = args[1]
  const currentExe = args[2]
  const watchdogSec = Number(args[3]) || 10

  if (!parentPid || !newExe || !currentExe) {
    fail('参数不足。用法: node updater-worker.js <parentPid> <newExe> <currentExe> [watchdogSec]')
  }

  log('===== 更新 Worker 启动 =====')
  log(`parentPid=${parentPid}  newExe=${newExe}  currentExe=${currentExe}  watchdogSec=${watchdogSec}`)

  // 1. 等待父进程退出
  await waitForParentExit(parentPid)

  // 2. 备份旧 exe
  const backupPath = currentExe + '.backup'
  log(`备份: ${currentExe} → ${backupPath}`)
  try {
    fs.copyFileSync(currentExe, backupPath)
    log('备份完成')
  } catch (err) {
    fail('备份失败: ' + err.message)
  }

  // 3. 替换
  log(`替换: ${newExe} → ${currentExe}`)
  try {
    // 先删旧文件（Windows 下 rename 更可靠）
    fs.unlinkSync(currentExe)
    fs.copyFileSync(newExe, currentExe)
    // 清理下载的临时文件
    try { fs.unlinkSync(newExe) } catch { /* 忽略 */ }
    log('替换完成')
  } catch (err) {
    // 回滚
    log('替换失败，回滚: ' + err.message)
    try {
      fs.unlinkSync(currentExe)
      fs.copyFileSync(backupPath, currentExe)
      fs.unlinkSync(backupPath)
      log('回滚完成')
    } catch (rollbackErr) {
      log('回滚也失败了: ' + rollbackErr.message)
    }
    fail('替换失败且已回滚: ' + err.message)
  }

  // 4. 启动新版本
  log(`启动新版本: ${currentExe}`)
  let child
  try {
    child = spawn(currentExe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.unref()
    log(`新版本启动成功，PID=${child.pid}`)
  } catch (err) {
    // 回滚
    log('启动失败，回滚: ' + err.message)
    try {
      fs.unlinkSync(currentExe)
      fs.copyFileSync(backupPath, currentExe)
      fs.unlinkSync(backupPath)
      log('回滚完成')
    } catch (rollbackErr) {
      log('回滚也失败了: ' + rollbackErr.message)
    }
    fail('启动失败且已回滚: ' + err.message)
  }

  // 5. 看门狗验证
  log(`看门狗验证: 等待 ${watchdogSec} 秒检查新进程是否存活...`)
  for (let i = 0; i < watchdogSec; i++) {
    await sleep(1000)
    if (child.exitCode !== null) {
      // 子进程已退出
      log(`新进程启动后 ${i + 1} 秒就退出了 (exitCode=${child.exitCode})，回滚...`)
      try {
        fs.unlinkSync(currentExe)
        fs.copyFileSync(backupPath, currentExe)
        fs.unlinkSync(backupPath)
        log('回滚完成')
      } catch (rollbackErr) {
        log('回滚失败: ' + rollbackErr.message)
      }
      fail('新版本启动后立即退出，已自动回滚到旧版本')
    }
  }

  // 6. 验证通过：清理备份
  log('看门狗验证通过，清理备份')
  try {
    // 延迟 2 秒再删备份，确保新进程完全启动
    await sleep(2000)
    fs.unlinkSync(backupPath)
    log('备份已清理')
  } catch (err) {
    log('清理备份失败（非致命）: ' + err.message)
  }

  log('===== 更新完成 =====')
  process.exit(0)
}

main().catch((err) => {
  log('未捕获异常: ' + (err && err.stack ? err.stack : String(err)))
  process.exit(1)
})