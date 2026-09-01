// ═══════════════════════════════════════════════════════════════
// 配置存储（简单键值 JSON 文件）
// 开发模式：项目根目录/config.json
// 安装模式：$DSH_HOME/storages/deepseek-harness-desktop/config.json
// ═══════════════════════════════════════════════════════════════

const fs = require('node:fs')
const { dirname } = require('node:path')
const { DEFAULT_SHORTCUT, configFilePath } = require('./constants')
const { logEvent } = require('./state')

function createJsonStore(defaults) {
  const filePath = configFilePath()
  let data = { ...defaults }

  try {
    data = { ...defaults, ...JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  } catch { /* 文件不存在或解析失败 → 使用 defaults */ }

  function save() {
    try {
      fs.mkdirSync(dirname(filePath), { recursive: true })
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
  update: { autoCheck: true, skippedVersion: '' },
})

module.exports = { store }