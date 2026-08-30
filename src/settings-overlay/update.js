// ── 更新 UI DOM（仅自动检查相关，更新状态由 Env 模块管理）──
    DOM.update = {
      autoCheckInput: qs('updateAutoCheckInput'), autoCheckDesc: qs('updateAutoCheckDesc'),
      skippedVersion: qs('updateSkippedVersion'),
    }

    // ── 自动更新模块（下载/安装/自动检查设置）──
    const Update = {
      download: function () {
        return IPC.updateDownload().then(function (st) {
          state.env.app.status = st.status
          state.env.app.progress = st.progress || 0
          state.env.app.error = st.error || ''
          Env.renderOne('app')
          if (st.status === 'downloaded') { Toast.success('下载完成，点击「退出并更新」重启安装') }
          else if (st.status === 'error') { Toast.error('下载失败: ' + (st.error || '')) }
        })
      },
      install: function () {
        Toast.info('正在退出并更新...')
        IPC.updateInstall()
      },
      manual: function () {
        try {
          window.updateAPI.openManual().then(function () { Toast.info('已在浏览器打开下载页') })
        } catch (e) { Toast.error('打开下载页失败') }
      },
      // 订阅主进程推送的实时状态：更新进度条/状态
      subscribe: function () {
        if (!window.updateAPI.onState) return
        window.updateAPI.onState(function (st) {
          if (st.status === 'downloading' || st.status === 'verifying') {
            state.env.app.status = st.status
            state.env.app.progress = st.progress || 0
            state.env.app.error = st.error || ''
            Env.renderOne('app')
          } else if (st.status === 'downloaded') {
            state.env.app.status = st.status
            state.env.app.progress = 100
            state.env.app.downloaded = true
            Env.renderOne('app')
          } else if (st.status === 'error') {
            state.env.app.status = st.status
            state.env.app.progress = 0
            state.env.app.error = st.error || ''
            Env.renderOne('app')
          }
        })
      },
      loadAutoCheck: function () {
        return IPC.updateGetAutoCheck().then(function (enabled) {
          DOM.update.autoCheckInput.checked = enabled
        }).then(function () {
          return IPC.updateGetSkippedVersion()
        }).then(function (skipped) {
          if (skipped) {
            DOM.update.skippedVersion.style.display = 'block'
            DOM.update.skippedVersion.textContent = '已跳过版本 v' + skipped
          } else {
            DOM.update.skippedVersion.style.display = 'none'
          }
        })
      },
      toggleAutoCheck: function () {
        const enabled = DOM.update.autoCheckInput.checked
        IPC.updateSetAutoCheck(enabled).then(function () {
          if (enabled) {
            DOM.update.skippedVersion.style.display = 'none'
            Toast.success('已开启自动检查更新')
          } else {
            Toast.info('已关闭自动检查更新')
          }
        })
      },
    }