// ═══════════════════════════════════════════════════════════════
// 运行时模式检测（纯基础设施，无 IPC / 无进程副作用）
//
// 三种运行模式：
//   dev       — 开发模式（electron .），app.isPackaged === false
//   installer — NSIS 安装包，exe 在 Program Files（稳定）
//   portable  — electron-builder portable，exe 解压到 %TEMP% 运行
//                PORTABLE_EXECUTABLE_FILE 指向用户双击的真实 exe（含版本号）
//
// 本模块只做「我处于什么模式 / 真实 exe 在哪」，被 core 及业务层复用，
// 不依赖 lifecycle，避免 core → lifecycle 的层级倒挂。
// ═══════════════════════════════════════════════════════════════

const { app } = require('electron')

function mode() {
  if (!app.isPackaged) return 'dev'
  if (process.env.PORTABLE_EXECUTABLE_DIR) return 'portable'
  return 'installer'
}

// 真实 exe 路径（稳定，重启后仍有效）
// dev 模式返回 null（调用方用 app.relaunch 默认 execPath）
// 便携版用 PORTABLE_EXECUTABLE_FILE（含版本号文件名，如 "App 1.0.0.exe"），
// 不能用 basename(app.getPath('exe'))，因为内层 exe 名不含版本号
function realExePath() {
  if (!app.isPackaged) return null
  if (process.env.PORTABLE_EXECUTABLE_FILE) return process.env.PORTABLE_EXECUTABLE_FILE
  return app.getPath('exe')
}

module.exports = { mode, realExePath }