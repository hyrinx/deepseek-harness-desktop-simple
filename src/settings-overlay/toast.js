// ── Toast 通知 ──
    const Toast = (function () {
      const el = qs('toast')
      let timer = null
      function show(msg, type, duration) {
        type = type || 'info'; duration = duration || 2000
        el.className = 'toast ' + type
        el.innerHTML = '<span class="toast-dot"></span>' + msg
        void el.offsetWidth
        el.classList.add('show')
        clearTimeout(timer)
        timer = setTimeout(function () { el.classList.remove('show') }, duration)
      }
      return {
        success: function (m) { show(m, 'success') },
        info: function (m) { show(m, 'info') },
        error: function (m) { show(m, 'error') },
      }
    })()