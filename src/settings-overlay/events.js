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