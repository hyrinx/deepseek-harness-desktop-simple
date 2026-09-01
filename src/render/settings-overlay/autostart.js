// ── 开机自启模块 ──
    const AutoStart = {
      render: function () {
        const a = state.autostart
        DOM.autostart.input.checked = a.enabled
        DOM.autostart.input.disabled = !a.available || a.busy
        if (!a.available) { DOM.autostart.desc.textContent = '该功能仅在打包为 .exe 安装版后可用（调试模式下无法修改）'; DOM.autostart.desc.classList.add('warn') }
        else { DOM.autostart.desc.textContent = '登录 Windows 时自动启动本应用（自动启动仅出现在系统托盘，不主动显示窗口）'; DOM.autostart.desc.classList.remove('warn') }
      },
      load: function () {
        return IPC.getAutoStart().then(function (res) {
          state.autostart.enabled = Boolean(res && res.enabled)
          state.autostart.available = Boolean(res && res.available)
          state.autostart.actuallySet = Boolean(res && res.actuallySet)
          AutoStart.render()
        })
      },
      commit: function (nextEnabled) {
        if (state.autostart.busy) return
        if (!state.autostart.available) { Toast.info('打包为 .exe 后可使用此功能'); this.render(); return }
        state.autostart.enabled = nextEnabled; state.autostart.busy = true; this.render()
        return IPC.setAutoStart(nextEnabled).then(function (res) {
          state.autostart.busy = false
          if (!res) { state.autostart.enabled = !nextEnabled; AutoStart.render(); Toast.error('设置失败'); return }
          state.autostart.actuallySet = Boolean(res.actuallySet)
          if (Boolean(res.actuallySet) !== nextEnabled) {
            state.autostart.enabled = !nextEnabled
            AutoStart.render()
            Toast.error(nextEnabled ? '开启开机自启失败，请检查系统权限' : '关闭开机自启失败')
            return
          }
          AutoStart.render()
          Toast.success(nextEnabled ? '已开启开机自启' : '已关闭开机自启')
        })
      },
    }