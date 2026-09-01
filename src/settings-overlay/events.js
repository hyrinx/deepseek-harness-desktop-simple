// ── 事件绑定 ──
    function bindEvents() {
      const tabBtns = overlay.querySelectorAll('.tab-btn')
      const tabPanels = overlay.querySelectorAll('.tab-panel')
      tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          const targetTab = btn.dataset.tab
          tabBtns.forEach(function (b) { b.classList.remove('active') })
          btn.classList.add('active')
          tabPanels.forEach(function (p) { p.classList.remove('active') })
          const targetPanel = qs('tab-' + targetTab)
          if (targetPanel) targetPanel.classList.add('active')
        })
      })

      DOM.input.addEventListener('focus', function () { Recorder.start() })
      DOM.input.addEventListener('blur', function () { if (state.recorder.recording) Recorder.stop() })
      DOM.autostart.input.addEventListener('change', function (e) { AutoStart.commit(Boolean(e.target.checked)) })

      overlay.addEventListener('keydown', function (e) {
        if (state.recorder.recording) {
          e.preventDefault(); e.stopPropagation()
          const noMod = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
          if (noMod && (e.key === 'Backspace' || e.key === 'Delete')) { DOM.input.blur(); Recorder.clear(); return }
          if (e.key === 'Escape') { DOM.input.blur(); Recorder.cancel(); return }
          const accel = eventToAccelerator(e)
          if (!accel) return
          state.recorder.draft = accel
          const parts = accel.split('+'), last = parts[parts.length - 1]
          if (!PURE_MODIFIER_KEYS.has(last) && parts.length >= 2) { DOM.input.blur(); state.recorder.recording = false; Recorder.commit(accel) }
          else Recorder.render()
          return
        }
        if (e.key === 'Escape') { window.__dshHideSettingsOverlay(); return }
      }, true)

      DOM.resetBtn.addEventListener('click', function () {
        state.recorder.recording = false
        Recorder.commit(DEFAULT_SHORTCUT).then(function () { Toast.success('已恢复默认快捷键') })
      })

      DOM.env.checkAll.addEventListener('click', function () { Env.checkAll() })
      DOM.env.nodeUpdate.addEventListener('click', function () {
        if (!state.env.node.ok) {
          if (DOM.env.nodeUpdate.disabled) return
          DOM.env.nodeUpdate.disabled = true
          DOM.env.nodeUpdate.textContent = '准备中...'
          IPC.getNodejsInstallPath().then(function (res) {
            var current = res.path || ''
            IPC.selectNodejsInstallPath(current).then(function (sel) {
              var newPath = sel.path
              if (newPath === null) {
                DOM.env.nodeUpdate.disabled = false
                Env.renderOne('node')
                return
              }
            var trimmed = newPath.trim()
            if (!trimmed) {
              Toast.error('路径不能为空')
              DOM.env.nodeUpdate.disabled = false
              Env.renderOne('node')
              return
            }
            IPC.setNodejsInstallPath(trimmed).then(function (ok) {
              if (!ok) {
                Toast.error('保存路径失败')
                DOM.env.nodeUpdate.disabled = false
                Env.renderOne('node')
                return
              }
              DOM.env.nodeUpdate.textContent = '下载中...'
              state.env.nodejs.downloading = true
              state.env.nodejs.downloadProgress = 0
              state.env.nodejs.downloadMessage = '准备下载...'
              Env.renderNodejs()

              var stopProgress = IPC.onNodejsProgress(function (data) {
                state.env.nodejs.downloading = data.stage !== 'done' && data.stage !== 'error'
                if (data.percent != null) state.env.nodejs.downloadProgress = data.percent
                state.env.nodejs.downloadMessage = data.message || ''
                Env.renderNodejs()
                if (data.stage === 'done') {
                  state.env.nodejs.downloading = false
                  stopProgress()
                  Env.checkNodejs().then(function () {
                    Toast.success('Node.js 安装完成！')
                  })
                } else if (data.stage === 'error') {
                  state.env.nodejs.downloading = false
                  stopProgress()
                  DOM.env.nodeUpdate.disabled = false
                  Env.renderOne('node')
                  Toast.error(data.message || '下载失败')
                }
              })

              IPC.startNodejsDownload().then(function (result) {
                if (!result.installed && result.reason === 'error') {
                  state.env.nodejs.downloading = false
                  DOM.env.nodeUpdate.disabled = false
                  Env.renderOne('node')
                  Env.renderNodejs()
                  Toast.error(result.error || '下载失败')
                }
              })
            })
          })
        })
        } else {
          Env.checkOne('node')
        }
      })
      DOM.env.npmUpdate.addEventListener('click', function () {
        const hasUpdate = state.env.npm.latestVersion && state.env.npm.version && state.env.npm.latestVersion !== state.env.npm.version
        if (hasUpdate) { Env.updateNpm() } else { Env.checkOne('npm') }
      })
      DOM.env.pnpmUpdate.addEventListener('click', function () {
        if (!state.env.pnpm.ok) { Env.updatePnpm() }
        else {
          const hasUpdate = state.env.pnpm.latestVersion && state.env.pnpm.version && state.env.pnpm.latestVersion !== state.env.pnpm.version
          if (hasUpdate) { Env.updatePnpm() } else { Env.checkOne('pnpm') }
        }
      })
      DOM.env.dshUpdate.addEventListener('click', function () {
        const hasUpdate = state.env.dsh.latestVersion && state.env.dsh.version && state.env.dsh.latestVersion !== state.env.dsh.version
        if (hasUpdate) { Env.updateDsh() } else { Env.checkOne('dsh') }
      })
      DOM.env.dshPluginBtn.addEventListener('click', function () { Env.updatePlugin() })
      DOM.env.restartBtn.addEventListener('click', function () {
        DOM.env.restartBtn.disabled = true
        DOM.env.restartBtn.textContent = '重启中...'
        IPC.restartHost()
      })

      DOM.env.appUpdate.addEventListener('click', function () {
        if (state.env.app.status === 'available') { Update.download() }
        else if (state.env.app.status === 'downloaded') { Update.install() }
        else { Env.checkOne('app') }
      })
      DOM.update.autoCheckInput.addEventListener('change', function () { Update.toggleAutoCheck() })
    }

    qs('close').addEventListener('click', function () { window.__dshHideSettingsOverlay() })
    document.getElementById('dsh-so-backdrop').addEventListener('click', function () { window.__dshHideSettingsOverlay() })
    document.getElementById('dsh-so-panel').addEventListener('click', function (e) { e.stopPropagation() })

    bindEvents()

    Promise.all([IPC.getSettings(), IPC.fillAboutInfo(), AutoStart.load(), Env.checkAll(), Update.loadAutoCheck()]).then(function (r) {
      const settings = r[0]
      const saved = settings && settings.shortcuts && settings.shortcuts.toggleWindow
      if (saved !== undefined && saved !== null) { state.recorder.shortcut = saved; state.recorder.draft = saved }
      Recorder.render()
    }).catch(function (e) {
      console.error('[settings-overlay] 初始化失败', e)
      Toast.error('初始化失败')
    })