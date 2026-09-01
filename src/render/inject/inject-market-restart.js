// 接管 dsh-market 的 DSH 重启请求，改由 Electron 外壳管理 DSH 子进程重启
// 拦截 POST /dsh-market/restart → 返回 202 → 通过 IPC 触发 restartHost()
(function() {
  if (window.__dshMarketRestartInited) return
  window.__dshMarketRestartInited = true

  var origFetch = window.fetch.bind(window)

  window.fetch = function(url, init) {
    var urlStr = typeof url === 'string' ? url : (url && url.url)
    var method = (init && init.method) || 'GET'

    // 拦截 market 的 POST /dsh-market/restart 请求
    if (urlStr === '/dsh-market/restart' && method === 'POST') {
      console.log('[桌面外壳] 接管 market 重启请求，触发 DSH 子进程重启')

      // 返回 202，让 market 客户端进入"等待重启完成"轮询状态
      var fakeResponse = new Response(
        JSON.stringify({ ok: true }),
        { status: 202, headers: { 'content-type': 'application/json' } }
      )

      // 异步触发 Electron 外壳重启 DSH 子进程并重新导航
      if (window.appAPI && window.appAPI.restartHost) {
        window.appAPI.restartHost().catch(function(err) {
          console.error('[桌面外壳] DSH 子进程重启失败:', err)
        })
      }

      return Promise.resolve(fakeResponse)
    }

    return origFetch(url, init)
  }
})()