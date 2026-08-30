// ═══════════════════════════════════════════════════════════════
// 更新相关纯工具函数（不依赖 Electron，可被 node 直接单测）
// ═══════════════════════════════════════════════════════════════

const crypto = require('node:crypto')
const fs = require('node:fs')

// 简单语义版本比较：a > b 返回 true（整数段逐位比较，忽略前导 v）
function isVersionNewer(a, b) {
  const av = (a || '').replace(/^v/i, '').split('.').map((s) => Number(s))
  const bv = (b || '').replace(/^v/i, '').split('.').map((s) => Number(s))
  if (!av.length || !bv.length) return false
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const x = av[i] || 0
    const y = bv[i] || 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

// 版本号归一化：去掉前导 v，去空
function normalizeVersion(v) {
  return String(v || '').replace(/^v/i, '').trim()
}

// 平台键（下载清单按此选资产）
function platformKey() {
  const arch = process.arch === 'arm64' ? 'arm64' : (process.arch === 'ia32' ? 'x86' : 'x64')
  return 'win-' + arch
}

// 判断字节是否为 PE 可执行文件（'MZ' 头）
function bytesArePe(buf) {
  if (!buf || buf.length < 2) return false
  return buf[0] === 0x4d && buf[1] === 0x5a
}

// 计算文件的 SHA-256
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const s = fs.createReadStream(filePath)
    s.on('data', (c) => hash.update(c))
    s.on('end', () => resolve(hash.digest('hex')))
    s.on('error', reject)
  })
}

// 组装带镜像的候选源列表：先是原始 URL，再依次追加用户自定义镜像与内置镜像。
// 输出顺序即尝试顺序，已去重。
function buildMirrorSources(url, options = {}) {
  const userMirror = options.userMirror || ''
  const builtinMirrors = options.builtinMirrors || []
  const list = [url]
  const seen = new Set([url])
  const add = (m) => {
    const base = String(m || '').trim().replace(/[\\/]+$/, '')
    if (!base) return
    const u = base + '/' + url
    if (!seen.has(u)) { seen.add(u); list.push(u) }
  }
  add(userMirror)
  builtinMirrors.forEach(add)
  return list
}

module.exports = {
  isVersionNewer, normalizeVersion, platformKey, bytesArePe, sha256File, buildMirrorSources,
}