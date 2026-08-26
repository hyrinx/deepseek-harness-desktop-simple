// ═══════════════════════════════════════════════════════════════
// 测试：开机自启能否完全用「纯 Electron API」实现，而不直接操作注册表
//
//   被测逻辑：app.setLoginItemSettings({ openAtLogin:true/false }) 写入/删除
//   事实源  ：仅用 reg query 做「断言」验证 API 操作后在注册表是否真的落盘/删除，
//             生产代码不直接改注册表。开/关全部走纯 Electron API。
//
//   运行：node_modules\.bin\electron.cmd tests\autostart-pure-api.test.js
//   退出码：全部通过 0，任一失败 1
// ═══════════════════════════════════════════════════════════════
const { app } = require('electron')
const { execSync } = require('node:child_process')

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'

// 隔离配置：读写一套独立的值名+路径+参数，绝不触碰真实自启条目
// path 故意设成与 process.execPath 不同的“外部 exe”，模拟便携版真实双击路径≠临时解压路径
const TEST_NAME = 'pureapi-autostart-test'
const TEST_PATH = 'C:\\pure-api-test\\FakeApp 1.0.0.exe'
const TEST_ARGS = ['--silence']

let pass = 0
let fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log('  [PASS] ' + label) }
  else { fail++; console.log('  [FAIL] ' + label + (extra ? '  ' + extra : '')) }
}

// 事实源（oracle）：读注册表 Run 键，判断指定值名是否存在
function regValueExists(name) {
  try {
    const out = execSync(`chcp 65001 > nul && reg query "${RUN_KEY}"`, {
      encoding: 'utf-8', windowsHide: true, timeout: 5000,
    })
    return new RegExp('\\b' + name + '\\b').test(out)
  } catch (e) {
    return false
  }
}

app.whenReady().then(() => {
  if (process.platform !== 'win32') {
    console.log('本测试仅针对 Windows（注册表自启）执行。')
    app.exit(0)
    return
  }

  console.log('=== 纯 Electron API 开机自启测试 ===')
  console.log('app.name        =', app.name)
  console.log('process.execPath=', process.execPath)
  console.log('隔离配置: name=%s', TEST_NAME)
  console.log('          path = %s', TEST_PATH)
  console.log('          args = %j', TEST_ARGS)
  console.log('')

  const opts = { name: TEST_NAME, path: TEST_PATH, args: TEST_ARGS }

  // ── 阶段 1：纯 API 开启自启 ──
  console.log('阶段1: 纯 API 开启自启')
  app.setLoginItemSettings({ openAtLogin: true, ...opts })
  check('开启后注册表已写入该值', regValueExists(TEST_NAME))

  // 纯 API 读回：仅记录，不以此判定位（本环境已知不可靠）
  const readBack = app.getLoginItemSettings(opts)
  console.log('  getLoginItemSettings() 读回:', JSON.stringify({
    openAtLogin: readBack.openAtLogin,
    executableWillLaunchAtLogin: readBack.executableWillLaunchAtLogin,
  }))

  // ── 阶段 2：纯 API 关闭自启（带 name）──
  console.log('阶段2: 纯 API 关闭自启(传 name)')
  app.setLoginItemSettings({ openAtLogin: false, ...opts })
  check('关闭后注册表已删除该值', !regValueExists(TEST_NAME))

  // ── 阶段 3：复现坑点——关闭时省略 name 会静默失效 ──
  console.log('阶段3: 复现「关闭时省略 name」行为')
  app.setLoginItemSettings({ openAtLogin: true, ...opts })
  check('(准备)再次开启', regValueExists(TEST_NAME))
  app.setLoginItemSettings({ openAtLogin: false, path: TEST_PATH, args: TEST_ARGS }) // 故意不传 name
  check('省略 name 时条目残留(证明必须显式传 name 才能删)', regValueExists(TEST_NAME))
  app.setLoginItemSettings({ openAtLogin: false, ...opts }) // 清理
  check('(清理)传 name 后条目已删除', !regValueExists(TEST_NAME))

  console.log('')
  console.log('结果: %d 通过, %d 失败', pass, fail)
  console.log(fail === 0
    ? '==> 结论: 纯 Electron API 可完成开机自启的开启/删除（必须显式传 name），无需直接操作注册表'
    : '==> 存在失败项，请查看上方 FAIL')
  app.exit(fail === 0 ? 0 : 1)
})