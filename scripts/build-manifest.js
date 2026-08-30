// ── 发布辅助：给已打包的 exe 计算 size + sha256，写入 versions.json ──
// 用法：
//   node scripts/build-manifest.js <exe路径> <版本> [arch]
// 例：
//   node scripts/build-manifest.js "dist/DeepSeek Harness Desktop Simple.exe" 1.6.0 x64
// 会读取/生成根目录 versions.json，把对应 arch 的 portable.url/size/sha256 填好。
// 说明：url 里带空格是合法的，发布时按 release 资产命名套路填。

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const WORKSPACE = path.join(__dirname, '..')
const MANIFEST = path.join(WORKSPACE, 'versions.json')
const REPO = 'hyrinx/deepseek-harness-desktop-simple'

const [,, exePath, versionRaw, archRaw] = process.argv
if (!exePath || !versionRaw) {
  console.error('用法: node scripts/build-manifest.js <exe路径> <版本> [arch=x64]')
  console.error('示例: node scripts/build-manifest.js "dist/xxx.exe" 1.6.0 x64')
  process.exit(1)
}
const version = versionRaw.replace(/^v/i, '')
const arch = (archRaw || 'x64').toLowerCase()
const key = 'win-' + arch

const filePath = path.resolve(WORKSPACE, exePath)
if (!fs.existsSync(filePath)) {
  console.error(`找不到文件: ${filePath}`)
  process.exit(1)
}

const stat = fs.statSync(filePath)
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'))
manifest.version = version
manifest.platforms = manifest.platforms || {}
manifest.platforms[key] = manifest.platforms[key] || {}
manifest.platforms[key].portable = manifest.platforms[key].portable || {}
const portable = manifest.platforms[key].portable
portable.url = `https://github.com/${REPO}/releases/download/v${version}/${encodeURI(path.basename(filePath))}`
portable.size = stat.size
portable.sha256 = sha256
portable.arch = arch

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

console.log(`✔ 已写入 ${MANIFEST}`)
console.log(`  版本      : v${version}`)
console.log(`  平台      : ${key}`)
console.log(`  文件      : ${path.basename(filePath)}`)
console.log(`  大小      : ${stat.size} bytes (~${(stat.size / 1024 / 1024).toFixed(2)} MB)`)
console.log(`  SHA-256   : ${sha256}`)
console.log(`  URL       : ${portable.url}`)