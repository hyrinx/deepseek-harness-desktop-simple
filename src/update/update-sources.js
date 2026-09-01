// ═══════════════════════════════════════════════════════════════
// 更新源（app 自身更新的版本探测与资产定位）
//
// 策略：
//   - 更新源优先级：Gitee → GitHub（国内优先，GitHub 兜底）
//   - 探测最新版本：按优先级逐源请求 releases/latest
//   - 降级规则（关键）：
//       * HTTP 404 视为「该源暂无发布版本」，跳过并继续下一源，不算"网络故障"
//       * TLS / 超时 / DNS 等网络类错误记为故障，继续下一源
//       * 遍历结束：优先抛网络类错误；若全是"无版本"，则报"仓库暂无发布版本"
//   - 依赖统一网络层 net.js，证书类错误会带 code='TLS_CERT' 与可读中文提示
// ═══════════════════════════════════════════════════════════════

const { getJson, normalizeError } = require('../core/net')

const UPDATE_OWNER = 'hyrinx'
const UPDATE_REPO = 'deepseek-harness-desktop-simple'

// api  -> 最新版本检测接口
// feed -> 版本资产下载基址（host/releases/download/{tag}/{file}）
const SOURCES = [
  {
    name: 'gitee',
    api: `https://gitee.com/api/v5/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`,
    feed: `https://gitee.com/${UPDATE_OWNER}/${UPDATE_REPO}`,
  },
  {
    name: 'github',
    api: `https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`,
    feed: `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}`,
    headers: { 'User-Agent': `DeepSeekHarnessDesktop/${UPDATE_REPO}` },
  },
]

// 简单语义版本比较：a > b 返回 true
function isVersionNewer(a, b) {
  if (!a || !b) return false
  const av = a.split('.').map(Number)
  const bv = b.split('.').map(Number)
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    if ((av[i] || 0) > (bv[i] || 0)) return true
    if ((av[i] || 0) < (bv[i] || 0)) return false
  }
  return false
}

// 归一化：把 tag ("v1.0.0" / "1.0.0") 统一成不带 v 前缀的版本号
function tagToVersion(tag) {
  return String(tag || '').replace(/^v/i, '').trim()
}

// 下载资产 URL：由命中的源与 tag 构造
function downloadUrlFor(source, tag, fileName) {
  const src = SOURCES.find((s) => s.name === source) || SOURCES[SOURCES.length - 1]
  return `${src.feed}/releases/download/${tag}/${encodeURIComponent(fileName)}`
}

/**
 * 按优先级探测最新版本。
 * @returns {Promise<{source, tag, version, release}>}
 * @throws 所有源都失败时抛出；{code:'NO_RELEASE'} 表示各源均无发布版本
 */
async function probeLatestRelease() {
  let noReleaseCount = 0
  let lastNetworkError = null

  for (const src of SOURCES) {
    try {
      const release = await getJson(src.api, { timeout: 30_000, headers: src.headers })
      const tag = (release && release.tag_name ? release.tag_name : '').trim()
      if (!tag) {
        noReleaseCount++
        continue
      }
      return {
        source: src.name,
        tag,
        version: tagToVersion(tag),
        release,
      }
    } catch (err) {
      if (err && err.statusCode === 404) {
        // 该源暂无 release，或仓库不存在 → 降级继续下一源
        noReleaseCount++
        continue
      }
      // 网络类 / 证书类故障：记录最近一次，继续下一源
      lastNetworkError = err
    }
  }

  // 遍历结束仍未成功
  if (lastNetworkError) {
    throw normalizeError(lastNetworkError)
  }
  if (noReleaseCount > 0) {
    const e = new Error('更新源暂无发布版本，无法检查更新')
    e.code = 'NO_RELEASE'
    throw e
  }
  const e = new Error('所有更新源均不可用，请检查网络连接')
  e.code = 'NO_SOURCE'
  throw e
}

module.exports = {
  SOURCES,
  UPDATE_OWNER,
  UPDATE_REPO,
  isVersionNewer,
  tagToVersion,
  downloadUrlFor,
  probeLatestRelease,
}