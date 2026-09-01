// 悬浮标题栏拖拽注入脚本（纯 DOM 事件 → IPC → 主进程 setBounds）
// 说明见 windows.js 中的 buildMainWindowOptions 注释
(function() {
  if (window.__dshDragInited) return
  window.__dshDragInited = true

  var DRAG_START_THRESHOLD = 4
  var isDown = false
  var isDragging = false
  var downX = 0, downY = 0
  var lastSentX = -1, lastSentY = -1
  var rafId = null
  var pendingMove = null

  // 判断是否为交互元素（按钮、输入框、链接、tab 等）；交互元素不拦截，可正常点击
  function isInteractive(el) {
    if (!el) return false
    var tag = el.tagName
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT'
        || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (el.getAttribute('role') === 'button'
        || el.getAttribute('role') === 'tab') return true
    if (el.closest && (el.closest('button') || el.closest('a')
        || el.closest('[role="button"]') || el.closest('[role="tab"]'))) return true
    return false
  }

  document.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return
    if (e.clientY > 44) return
    if (isInteractive(e.target)) return
    if (!window.windowDrag) return
    isDown = true
    isDragging = false
    downX = e.screenX
    downY = e.screenY
    lastSentX = e.screenX
    lastSentY = e.screenY
    e.preventDefault()
  })

  // 越过阈值才进入拖拽；拖拽后 rAF 节流 + 位置变化检测再发送坐标
  document.addEventListener('mousemove', function(e) {
    if (!isDown) return
    if (!isDragging) {
      if (Math.abs(e.screenX - downX) < DRAG_START_THRESHOLD
          && Math.abs(e.screenY - downY) < DRAG_START_THRESHOLD) return
      isDragging = true
      lastSentX = e.screenX
      lastSentY = e.screenY
      window.windowDrag.start(e.screenX, e.screenY)
      return
    }
    pendingMove = { x: Math.round(e.screenX), y: Math.round(e.screenY) }
    if (!rafId) {
      rafId = requestAnimationFrame(function() {
        rafId = null
        if (pendingMove && window.windowDrag) {
          var px = pendingMove.x, py = pendingMove.y
          if (px !== lastSentX || py !== lastSentY) {
            lastSentX = px; lastSentY = py
            window.windowDrag.move(px, py)
          }
          pendingMove = null
        }
      })
    }
  })

  function stopDrag() {
    if (!isDown) return
    isDown = false
    if (isDragging) {
      isDragging = false
      pendingMove = null
      lastSentX = lastSentY = -1
      if (rafId) { cancelAnimationFrame(rafId); rafId = null }
      if (window.windowDrag) window.windowDrag.end()
    }
  }
  document.addEventListener('mouseup', stopDrag)
  window.addEventListener('mouseup', stopDrag)

  // 悬浮标题栏双击最大化/还原
  document.addEventListener('dblclick', function(e) {
    if (e.clientY > 44) return
    if (isInteractive(e.target)) return
    if (!window.windowDrag || !window.windowDrag.toggleMaximize) return
    window.windowDrag.toggleMaximize()
  })
})()