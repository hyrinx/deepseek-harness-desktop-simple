// ═══════════════════════════════════════════════════════════════
// 配置存储（简单键值 JSON 文件）
// 便携模式 → exe 旁边的 config.json；标准模式 → %APPDATA%/DeepSeekHarness/config.json
// ═══════════════════════════════════════════════════════════════

const fs = require('node:fs')
const { join } = require('node:path')
const { DEFAULT_SHORTCUT, appRootDir } = require('./constants')
const { logEvent } = require('./state')

function createJsonStore(defaults) {
  const filePath = join(appRootDir(), 'config.json')
  let data = { ...defaults }

  try {
    data = { ...defaults, ...JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  } catch { /* 文件不存在或损坏 → 使用 defaults */ }

  function save() {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    } catch (err) {
      logEvent('store.save.fail', { err }, 'error')
    }
  }

  function resolve(key) {
    return key.split('.').reduce((o, k) => (o == null ? o : o[k]), data)
  }

  return {
    get store() { return { ...data } },
    get(key, fallback) {
      const v = resolve(key)
      return v === undefined || v === null ? fallback : v
    },
    set(key, value) {
      const keys = key.split('.')
      let obj = data
      for (let i = 0; i < keys.length - 1; i++) {
        if (obj[keys[i]] == null) obj[keys[i]] = {}
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      save()
    },
  }
}

const store = createJsonStore({
  shortcuts: { toggleWindow: DEFAULT_SHORTCUT },
  ui: { autoStart: false },
})

module.exports = { store }