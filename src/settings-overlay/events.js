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
      DOM.env.nodeRefresh.addEventListener('click', function () { Env.checkOne('node') })
      DOM.env.nodejsPathSetBtn.addEventListener('click', function () {
        if (DOM.env.nodejsPathSetBtn.disabled) return
        DOM.env.nodejsPathSetBtn.disabled = true
        IPC.getNodejsInstallPath().then(function (res) {
          var current = res.path || ''
          var newPath = prompt('请输入 Node.js 安装路径（无中文无空格，如 E:\\nodejs）：', current)
          DOM.env.nodejsPathSetBtn.disabled = false
          if (newPath === null) return // 用户取消
          var trimmed = newPath.trim()
          if (!trimmed) { Toast.error('路径不能为空'); return }
          IPC.setNodejsInstallPath(trimmed).then(function (ok) {
            if (ok) {
              state.env.nodejs.pathConfigured = true
              state.env.nodejs.localPath = trimmed
              Env.renderNodejs()
              Toast.success('路径已保存')
            } else {
              Toast.error('保存失败')
            }
          })
        })
      })
      DOM.env.nodejsDownloadBtn.addEventListener('click', function () {
        if (DOM.env.nodejsDownloadBtn.disabled) return
        DOM.env.nodejsDownloadBtn.disabled = true
        DOM.env.nodejsDownloadBtn.textContent = '下载中...'
        state.env.nodejs.downloading = true
        state.env.nodejs.downloadProgress = 0
        state.env.nodejs.downloadMessage = '准备下载...'
        Env.renderNodejs()

        var stopProgress = IPC.onNodejsProgress(function (data) {
          state.env.nodejs.downloading = data.stage !== 'done' && data.stage !== 'error'
          state.env.nodejs.downloadProgress = data.percent || 0
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
            DOM.env.nodejsDownloadBtn.disabled = false
            DOM.env.nodejsDownloadBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>下载'
            Toast.error(data.message || '下载失败')
          }
        })

        IPC.startNodejsDownload().then(function (result) {
          if (!result.installed && result.reason === 'error') {
            state.env.nodejs.downloading = false
            DOM.env.nodejsDownloadBtn.disabled = false
            DOM.env.nodejsDownloadBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>下载'
            Env.renderNodejs()
            Toast.error(result.error || '下载失败')
          }
        })
      })
      DOM.env.npmUpdate.addEventListener('click', function () { Env.updateNpm() })
      DOM.env.pnpmUpdate.addEventListener('click', function () { Env.updatePnpm() })
      DOM.env.dshUpdate.addEventListener('click', function () { Env.updateDsh() })
      DOM.env.dshPluginBtn.addEventListener('click', function () { Env.updatePlugin() })
      DOM.env.restartBtn.addEventListener('click', function () {
        DOM.env.restartBtn.disabled = true
        DOM.env.restartBtn.textContent = '重启中...'
        IPC.restartHost()
      })

      DOM.env.appRefresh.addEventListener('click', function () { Env.checkOne('app') })
      DOM.env.appDownload.addEventListener('click', function () { Update.download() })
      DOM.env.appInstall.addEventListener('click', function () { Update.install() })
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