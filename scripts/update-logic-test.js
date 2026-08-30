// ═══════════════════════════════════════════════════════════════
// 更新逻辑纯单测（无 Electron 依赖，node 直接运行）
// 运行：npm run test:updater  或  node scripts/update-logic-test.js
// 退出码 0 = 全部通过；非 0 = 有失败
// ═══════════════════════════════════════════════════════════════

const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const {
  isVersionNewer, normalizeVersion, platformKey, bytesArePe, sha256File, buildMirrorSources,
} = require('../src/updater-util')

let pass = 0
let fail = 0
function t(name, cond) {
  if (cond) { pass++; console.log('  ✔ ' + name) }
  else { fail++; console.log('  ✘ ' + name) }
}

console.log('▼ 版本比较 isVersionNewer')
t('1.5.1 > 1.5.0 → true', isVersionNewer('1.5.1', '1.5.0') === true)
t('1.5.0 > 1.5.0 → false', isVersionNewer('1.5.0', '1.5.0') === false)
t('1.5.0 > 1.6.0 → false', isVersionNewer('1.5.0', '1.6.0') === false)
t('v1.2.3 > 1.2.2 → true(忽略前导v)', isVersionNewer('v1.2.3', '1.2.2') === true)
t('2.0.0 > 1.99.99 → true', isVersionNewer('2.0.0', '1.99.99') === true)
t('空值 → false', isVersionNewer('', '1.0.0') === false)
t('1.0.1 > 1.0.1.0 → false', isVersionNewer('1.0.1', '1.0.1.0') === false)

console.log('▼ 版本归一化 normalizeVersion')
t("'v1.5.0' → '1.5.0'", normalizeVersion('v1.5.0') === '1.5.0')
t("' 1.5.0 ' → '1.5.0'", normalizeVersion(' 1.5.0 ') === '1.5.0')

console.log('▼ 平台键 platformKey')
const pk = platformKey()
t('以 win- 开头', /^win-/.test(pk))
t('结尾是 x86/x64/arm64 之一', /x86|x64|arm64$/.test(pk))

console.log('▼ PE 文件头检测 bytesArePe')
t('MZ 字节 → exe', bytesArePe(Buffer.from('MZ...')) === true)
t('非 MZ → 非 exe', bytesArePe(Buffer.from('<html>')) === false)
t('长度不足 → false', bytesArePe(Buffer.from('M')) === false)
t('空/空值 → false', bytesArePe(null) === false && bytesArePe(Buffer.alloc(0)) === false)

console.log('▼ 镜像组装 buildMirrorSources')
const srcs = buildMirrorSources('https://a.com/b.exe', {
  userMirror: 'https://m.cn/', builtinMirrors: ['https://m1.com/', 'https://m1.com/'],
})
t('原始 URL 在首位', srcs[0] === 'https://a.com/b.exe')
t('用户镜像其次', srcs[1] === 'https://m.cn/https://a.com/b.exe')
t('内置镜像去重', srcs.length === 3)
t('自动去掉镜像尾部斜杠', buildMirrorSources('x', { userMirror: 'https://m.cn/' })[1] === 'https://m.cn/x')
t('空镜像被忽略', buildMirrorSources('x', { userMirror: '', builtinMirrors: [] }).length === 1)

console.log('▼ 文件 SHA-256 sha256File (与首尾追加字节对照)')
;(async () => {
  const tmp = path.join(os.tmpdir(), 'dsh-test-' + Date.now() + '.exe')
  fs.writeFileSync(tmp, Buffer.from('MZhello-world-123'))
  t('sha256 与手工一致', await sha256File(tmp) === crypto.createHash('sha256').update('MZhello-world-123').digest('hex'))
  try { fs.unlinkSync(tmp) } catch {}

  console.log('\n结果：通过 ' + pass + '，失败 ' + fail)
  process.exit(fail === 0 ? 0 : 1)
})()