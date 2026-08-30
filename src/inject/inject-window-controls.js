// Win32 自绘窗口控制按钮（─ □ ✕），替代 titleBarOverlay 的系统按钮
// 去掉系统按钮后，按钮变成普通 DOM 元素，可以用 z-index 控制层级
(function() {
  if (window.__dshWindowControlsInited) return
  window.__dshWindowControlsInited = true
  if (!window.windowControls) return

  // 层级：按钮 z-index 需"高于普通页面内容、低于浮层"
  var Z = 100

  var SVG_MIN = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 5 H9.5" stroke="currentColor" stroke-width="1"/></svg>'
  var SVG_MAX = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
  var SVG_RESTORE = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 0.5 H9.5 V7" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
  var SVG_CLOSE = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="currentColor" stroke-width="1"/></svg>'
  // 图钉图标：垂直竖线 + 斜线头，模拟 📌
  var SVG_PIN = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1 L5 9 M3 2 L7 2 L6 5 L4 5 Z" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>'
  var SVG_PIN_ACTIVE = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1 L5 9 M3 2 L7 2 L6 5 L4 5 Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>'

  function makeBtn(inner, title, close) {
    var b = document.createElement('button')
    b.type = 'button'
    b.title = title
    b.setAttribute('aria-label', title)
    b.style.cssText = 'width:46px;height:44px;padding:0;margin:0;border:0;outline:0;background:transparent;cursor:default;display:flex;align-items:center;justify-content:center;color:#c9ccd1;'
    b.innerHTML = inner
    b.addEventListener('mouseenter', function() {
      b.style.background = close ? '#e81123' : 'rgba(255,255,255,0.085)'
      b.style.color = '#ffffff'
    })
    b.addEventListener('mouseleave', function() {
      b.style.background = 'transparent'
      b.style.color = '#c9ccd1'
    })
    return b
  }

  var host = document.createElement('div')
  host.setAttribute('data-dsh-window-controls', '1')
  host.style.cssText = 'position:fixed;top:0;right:0;height:44px;display:flex;align-items:stretch;z-index:' + Z + ';'

  var btnMin = makeBtn(SVG_MIN, '最小化', false)
  var btnPin = makeBtn(SVG_PIN, '窗口置顶', false)
  var btnMax = makeBtn(SVG_MAX, '最大化', false)
  var btnClose = makeBtn(SVG_CLOSE, '关闭', true)

  btnMin.addEventListener('click', function() { window.windowControls.minimize() })
  btnPin.addEventListener('click', function() {
    window.windowControls.togglePin().then(function(pinned) {
      setPinIcon(pinned)
    }).catch(function() {})
  })
  btnMax.addEventListener('click', function() { window.windowControls.toggleMaximize() })
  btnClose.addEventListener('click', function() { window.windowControls.close() })

  function setPinIcon(pinned) {
    btnPin.innerHTML = pinned ? SVG_PIN_ACTIVE : SVG_PIN
    btnPin.title = pinned ? '取消置顶' : '窗口置顶'
    btnPin.setAttribute('aria-label', btnPin.title)
    if (pinned) {
      btnPin.style.background = 'rgba(255,255,255,0.085)'
      btnPin.style.color = '#ffffff'
    } else {
      btnPin.style.background = 'transparent'
      btnPin.style.color = '#c9ccd1'
    }
  }
  window.windowControls.isPinned().then(setPinIcon).catch(function() {})

  function setMaxIcon(isMax) {
    btnMax.innerHTML = isMax ? SVG_RESTORE : SVG_MAX
    btnMax.title = isMax ? '还原' : '最大化'
    btnMax.setAttribute('aria-label', btnMax.title)
  }
  window.windowControls.isMaximized().then(setMaxIcon).catch(function() {})
  if (window.windowControls.onMaximizeChange) {
    window.windowControls.onMaximizeChange(setMaxIcon)
  }

  // 顺序：图钉置顶 / 最小化 / 最大化 / 关闭
  host.appendChild(btnPin)
  host.appendChild(btnMin)
  host.appendChild(btnMax)
  host.appendChild(btnClose)
  ;(document.body || document.documentElement).appendChild(host)
})()