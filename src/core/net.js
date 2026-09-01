// ═══════════════════════════════════════════════════════════════
// 统一网络层（主进程内所有 HTTP(S) 请求的单一入口）
//
// 供以下模块复用，消除各处重复的 https/http 样板代码：
//   updater.js             — 探测最新版本 / 下载便携版 exe
//   update-sources.js      — 探测 Gitee / GitHub release
//   nodejs-bootstrap.js    — 探测 Node.js 版本 / 下载解压包
//
// 特性：
//   - GET / HEAD 请求，自动跟随重定向（跨协议，最多 10 跳）
//   - 统一超时、可传递请求头、可选下载进度回调
//   - 把 TLS 证书类错误识别为可读中文报错（code = 'TLS_CERT'），
//     用于给用户明确提示（默认不降级验证强度，保持安全）
//   - 纯 Node 模块，不依赖 electron，便于独立测试与复用
// ═══════════════════════════════════════════════════════════════

const https = require('node:https')
const http = require('node:http')

const DEFAULT_TIMEOUT = 30_000
const MAX_REDIRECTS = 10

// ═══════════════════════════════════════════════════════════════
// TLS / 证书错误识别
// ═══════════════════════════════════════════════════════════════

// 常见 TLS 证书验证失败的错误关键字（Node 与 Chromium 都可能抛出）
const TLS_ERROR_PATTERNS = [
  { re: /unable to verify the first certificate/i, label: '证书链无法被验证' },
  { re: /self[-\s]signed certificate/i, label: '自签名证书不被信任' },
  { re: /DEPTH_ZERO_SELF_SIGNED_CERT/i, label: '自签名证书不被信任' },
  { re: /CERT_HAS_EXPIRED/i, label: '证书已过期' },
  { re: /self[-\s]signed cert in chain/i, label: '证书链含自签名证书' },
  { re: /certificate has expired|UNABLE_TO_GET_ISSUER_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i, label: '证书不可信或已过期' },
]

// 判断某个错误是否属于 TLS 证书验证失败
function isTlsError(err) {
  const msg = String((err && err.message) || '')
  return TLS_ERROR_PATTERNS.some((p) => p.re.test(msg))
}

// 把异常包装成统一结构：{ code, message, httpStatus?, cause }
// 证书类错误返回 code='TLS_CERT' 与可读提示
function normalizeError(err, url) {
  const raw = err && err.message ? err.message : String(err || '未知错误')
  if (isTlsError(err)) {
    const detail = TLS_ERROR_PATTERNS.find((p) => p.re.test(raw))
    const label = detail ? detail.label : 'SSL 证书验证失败'
    const message = `${label}（${url || ''}）。` +
      '若处于公司网络 / 代理环境，可尝试为应用配置系统根证书（NODE_EXTRA_CA_CERTS）或在启动时加 `--use-system-ca`。'
    const e = new Error(message)
    e.code = 'TLS_CERT'
    e.cause = err
    return e
  }
  if (/ECONNRESET/i.test(raw)) {
    const e = new Error(`连接被重置，网络不稳定（${url || ''}）`)
    e.code = 'CONNECTION_RESET'
    e.cause = err
    return e
  }
  if (/ETIMEDOUT|timed out|超时/i.test(raw)) {
    const e = new Error(`请求超时（${url || ''}）`)
    e.code = 'TIMEOUT'
    e.cause = err
    return e
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    const e = new Error(`无法解析域名，请检查网络（${url || ''}）`)
    e.code = 'DNS_LOOKUP'
    e.cause = err
    return e
  }
  const e = new Error(raw)
  e.code = 'NETWORK'
  e.cause = err
  return e
}

// ═══════════════════════════════════════════════════════════════
// GET，返回完整响应体（二进制）
// ═══════════════════════════════════════════════════════════════

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeout=DEFAULT_TIMEOUT]
 * @param {object} [opts.headers] 额外请求头
 * @param {function} [opts.onProgress] ({received,total})=>void，total 可能为 0
 * @param {number} [opts.redirects=0] 内部递归用，重定向跳数
 * @returns {Promise<{ buffer: Buffer, url: string, statusCode: number }>}
 */
function fetchBuffer(url, opts) {
  opts = opts || {}
  const timeout = opts.timeout != null ? opts.timeout : DEFAULT_TIMEOUT
  const redirects = opts.redirects || 0
  const headers = Object.assign({ 'User-Agent': 'DeepSeekHarnessDesktop', 'Accept': '*/*' }, opts.headers || {})

  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) {
      return reject(new Error(`重定向次数过多（超过 ${MAX_REDIRECTS}）`))
    }
    const mod = url.startsWith('https') ? https : url.startsWith('http') ? http : null
    if (!mod) return reject(new Error(`不支持的协议：${url}`))

    const req = mod.get(url, { timeout, headers }, (res) => {
      const status = res.statusCode
      // 重定向跟随
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        const next = new URL(res.headers.location, url).toString()
        return fetchBuffer(next, Object.assign({}, opts, { redirects: redirects + 1 })).then(resolve).catch(reject)
      }
      if (status < 200 || status >= 300) {
        res.resume()
        const e = new Error(`HTTP ${status}`)
        e.statusCode = status
        return reject(e)
      }
      const total = parseInt(res.headers['content-length'], 10) || 0
      let received = 0
      const chunks = []
      res.on('data', (chunk) => {
        received += chunk.length
        chunks.push(chunk)
        if (opts.onProgress) opts.onProgress({ received, total })
      })
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), url, statusCode: status }))
      res.on('error', (err) => reject(err))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  }).catch((err) => {
    if (err && err.statusCode != null) throw err
    throw normalizeError(err, url)
  })
}

// ═══════════════════════════════════════════════════════════════
// 便捷封装：JSON / HEAD 探测
// ═══════════════════════════════════════════════════════════════

async function getJson(url, opts) {
  const { buffer } = await fetchBuffer(url, opts)
  try {
    return JSON.parse(buffer.toString('utf-8'))
  } catch (e) {
    const err = new Error(`返回内容不是合法 JSON：${url}`)
    err.code = 'BAD_JSON'
    throw err
  }
}

// HEAD 探测资源是否存在（用于镜像回退/候选版本探测）
function headAvailable(url, timeout) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : url.startsWith('http') ? http : null
    if (!mod) return resolve(false)
    const req = mod.request(url, {
      method: 'HEAD',
      timeout: timeout != null ? timeout : 10_000,
    }, (res) => {
      res.resume()
      resolve(res.statusCode >= 200 && res.statusCode < 400)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

module.exports = {
  fetchBuffer,
  getJson,
  headAvailable,
  isTlsError,
  normalizeError,
}