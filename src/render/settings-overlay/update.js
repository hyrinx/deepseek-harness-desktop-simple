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
          Env.renderOne('app')
          if (st.status === 'downloaded') { Toast.success('下载完成，点击安装并重启') }
          else if (st.status === 'error') { Toast.error('下载失败: ' + (st.error || '')) }
        })
      },
      install: function () {
        Toast.info('正在准备安装...')
        IPC.updateInstall()
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

    // ── 启动更新提示弹窗（antd Modal） ──
    const UpdateDialog = {
      _bound: false,
      _hide: function () {
        const mask = document.getElementById('dsh-so-updateMask')
        const modal = document.getElementById('dsh-so-updateModal')
        if (mask) mask.style.display = 'none'
        if (modal) { modal.style.display = 'none'; modal.classList.remove('show') }
        window.__dshHideSettingsOverlay()
      },
      bind: function () {
        if (this._bound) return
        this._bound = true
        const mask = document.getElementById('dsh-so-updateMask')
        const dwn = qs('updateDownloadBtn')
        const skip = qs('updateSkipBtn')
        const noRemind = qs('updateNoRemindBtn')
        const self = this
        if (mask) mask.addEventListener('click', function () { self._hide() })
        dwn.addEventListener('click', function () {
          dwn.disabled = true
          dwn.textContent = '下载中...'
          Update.download().then(function (st) {
            self._hide()
            if (st && st.status === 'downloaded') {
              window.__dshShowSettingsOverlay()
              Toast.success('下载完成，可在设置页「关于」安装')
            } else if (st && st.status === 'error') {
              Toast.error('下载失败: ' + (st.error || ''))
            }
          }).catch(function () {
            dwn.disabled = false
            dwn.textContent = '立即下载'
            self._hide()
            Toast.error('下载失败')
          })
        })
        skip.addEventListener('click', function () {
          const modal = document.getElementById('dsh-so-updateModal')
          IPC.updateSetSkippedVersion(String(modal ? modal.__dshVersion : ''))
          self._hide()
        })
        noRemind.addEventListener('click', function () {
          IPC.updateSetAutoCheck(false)
          self._hide()
        })
      },
      open: function (version) {
        const mask = document.getElementById('dsh-so-updateMask')
        const modal = document.getElementById('dsh-so-updateModal')
        if (!modal) return
        modal.__dshVersion = version
        qs('updateNewVersion').textContent = 'v' + version
        if (mask) mask.style.display = 'block'
        modal.classList.remove('show')
        void modal.offsetWidth
        modal.classList.add('show')
        this.bind()
      },
    }
    window.__dshUpdateDialog = UpdateDialog