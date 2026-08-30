// ── 设置覆盖层注入脚本（注入到主窗口渲染进程） ──
// 在最外层套 IIFE 避免污染全局；CSS/HTML 由 windows.js 在注入时拼接。
;(function () {
  if (window.__dshSettingsOverlayInjected) return
  window.__dshSettingsOverlayInjected = true

  // ════════════════════════════════════════════════
  // CSS 注入
  // ════════════════════════════════════════════════
  const css = document.createElement('style')
  css.id = 'dsh-so-style'
  css.textContent = __DSH_SETTINGS_CSS__
  document.head.appendChild(css)

  // ════════════════════════════════════════════════
  // HTML 注入
  // ════════════════════════════════════════════════
  const overlay = document.createElement('div')
  overlay.id = 'dsh-so'
  overlay.style.display = 'none'
  overlay.innerHTML = __DSH_SETTINGS_HTML__
  document.body.appendChild(overlay)

  // ════════════════════════════════════════════════
  // 显示/隐藏函数（供主进程调用）
  // ════════════════════════════════════════════════
  window.__dshShowSettingsOverlay = function () {
    overlay.style.display = 'flex'
    if (!overlay.__dshInited) {
      overlay.__dshInited = true
      initSettingsOverlay()
    }
  }
  window.__dshHideSettingsOverlay = function () {
    overlay.style.display = 'none'
  }

  // ════════════════════════════════════════════════
  // 设置页逻辑
  // ════════════════════════════════════════════════
  function initSettingsOverlay() {
    const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space'
    const PLACEHOLDER_IDLE = '点击录制快捷键'
    const PLACEHOLDER_REC = '按下组合键...'

    const CODE_TO_KEY = Object.assign(Object.create(null), {
      Space: 'Space', Backspace: 'Backspace', Delete: 'Delete', Enter: 'Enter',
      Escape: 'Esc', Tab: 'Tab', ArrowUp: 'Up', ArrowDown: 'Down',
      ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End',
      PageUp: 'PageUp', PageDown: 'PageDn', Insert: 'Insert', CapsLock: 'CapsLock',
      Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    })

    const KEY_DISPLAY = Object.assign(Object.create(null), {
      Space: 'Space', Backspace: '⌫', Delete: 'Del', Enter: 'Enter',
      Escape: 'Esc', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓',
      ArrowLeft: '←', ArrowRight: '→', Up: '↑', Down: '↓', Left: '←', Right: '→',
      Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
      Control: 'Ctrl', CommandOrControl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win',
      Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
      Insert: 'Ins', CapsLock: 'Caps',
    })

    const MODIFIER_NORMALIZE = Object.assign(Object.create(null), {
      ShiftLeft: 'Shift', ShiftRight: 'Shift',
      ControlLeft: 'Control', ControlRight: 'Control',
      AltLeft: 'Alt', AltRight: 'Alt',
      MetaLeft: 'Meta', MetaRight: 'Meta',
      OSLeft: 'Meta', OSRight: 'Meta',
    })

    const PURE_MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'CommandOrControl'])

    function qs(id) { return document.getElementById('dsh-so-' + id) }

    function codeToAccelKey(code) {
      const n = MODIFIER_NORMALIZE[code]; if (n) return n
      if (code.startsWith('Key')) return code.slice(3)
      if (code.startsWith('Digit')) return code.slice(5)
      if (code.startsWith('Numpad')) return 'Num' + code.slice(6)
      if (/^F\d+$/.test(code)) return code
      return CODE_TO_KEY[code] || code
    }

    function eventToAccelerator(e) {
      const modifiers = []
      if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl')
      if (e.altKey) modifiers.push('Alt')
      if (e.shiftKey) modifiers.push('Shift')
      const key = codeToAccelKey(e.code)
      if (PURE_MODIFIER_KEYS.has(key)) return modifiers.length ? modifiers.join('+') : null
      modifiers.push(key)
      if (/^F\d+$/.test(key) || modifiers.length >= 2) return modifiers.join('+')
      return null
    }

    function formatShortcut(raw) {
      if (!raw) return ''
      return raw.split('+').map(function (k) { return KEY_DISPLAY[k] || k }).join(' + ')
    }

    // ── Toast ──
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

    // ── IPC 桥接 ──
    const IPC = {
      getSettings: function () { try { return window.settingsAPI.getSettings() } catch (e) { return {} } },
      setShortcut: function (name, value) { try { return window.settingsAPI.setShortcut(name, value) } catch (e) { Toast.error('保存失败'); return false } },
      getAutoStart: function () { try { return window.settingsAPI.getAutoStart() } catch (e) { return { enabled: false, available: false, actuallySet: false } } },
      setAutoStart: function (enabled) { try { return window.settingsAPI.setAutoStart(enabled) } catch (e) { Toast.error('设置失败'); return null } },
      fillAboutInfo: function () {
        Promise.all([
          window.settingsAPI.getPlatform().catch(function () { return '-' }),
          window.settingsAPI.getVersion().catch(function () { return '0.1.0' }),
        ]).then(function (r) {
          qs('appPlatform').textContent = r[0]
          qs('appVersion').textContent = r[1]
        })
      },
      checkNode: function () { try { return window.envAPI.checkNode() } catch (e) { return { ok: false, error: String(e), version: '' } } },
      checkNpm: function () { try { return window.envAPI.checkNpm() } catch (e) { return { ok: false, error: String(e), version: '' } } },
      checkPnpm: function () { try { return window.envAPI.checkPnpm() } catch (e) { return { ok: false, error: String(e), version: '' } } },
      checkDsh: function () { try { return window.envAPI.checkDsh() } catch (e) { return { ok: false, error: String(e), version: '' } } },
      updateNpm: function () { try { return window.envAPI.updateNpm() } catch (e) { return { ok: false, error: String(e), output: '' } } },
      updatePnpm: function () { try { return window.envAPI.updatePnpm() } catch (e) { return { ok: false, error: String(e), output: '' } } },
      updateDsh: function () { try { return window.envAPI.updateDsh() } catch (e) { return { ok: false, error: String(e), output: '' } } },
      checkPlugin: function () { try { return window.envAPI.checkPlugin() } catch (e) { return { installed: false, version: '', error: String(e) } } },
      updatePlugin: function () { try { return window.envAPI.updatePlugin() } catch (e) { return { ok: false, error: String(e), output: '', beforeVer: '', afterVer: '' } } },
      onProgress: function (cb) { try { return window.envAPI.onProgress(cb) } catch (e) { return function () {} } },
      setupMarkDone: function () { try { return window.setupAPI.markDone() } catch (e) { return false } },
      updateCheck: function () { try { return window.updateAPI.check() } catch (e) { return { status: 'error', error: String(e) } } },
      updateDownload: function () { try { return window.updateAPI.download() } catch (e) { return { status: 'error', error: String(e) } } },
      updateInstall: function () { try { return window.updateAPI.install() } catch (e) { return false } },
      updateGetState: function () { try { return window.updateAPI.getState() } catch (e) { return { status: 'error', error: String(e) } } },
      
      updateGetAutoCheck: function () { try { return window.updateAPI.getAutoCheck() } catch (e) { return true } },
      updateSetAutoCheck: function (enabled) { try { return window.updateAPI.setAutoCheck(enabled) } catch (e) { return false } },
      updateGetSkippedVersion: function () { try { return window.updateAPI.getSkippedVersion() } catch (e) { return '' } },
      restartDsh: function () { try { return window.appAPI.restartDsh() } catch (e) { Toast.error('重启失败'); return false } },
    }

    // ── DOM 引用 ──
    const DOM = {
      sizer: qs('recorderSizer'), input: qs('recorderInput'), label: qs('recorderLabel'), resetBtn: qs('resetBtn'),
      autostart: { input: qs('autostartInput'), desc: qs('autostartDesc') },
      env: {
        appStatus: qs('appStatus'), appVersion: qs('appVersion'), appRefresh: qs('appRefreshBtn'),
        appDownload: qs('appDownloadBtn'), appInstall: qs('appInstallBtn'),
        appProgress: qs('appProgress'), appFill: qs('appFill'), appProgressText: qs('appProgressText'),
        nodeStatus: qs('nodeStatus'), nodeVersion: qs('nodeVersion'), nodeRefresh: qs('nodeRefreshBtn'),
        npmStatus: qs('npmStatus'), npmVersion: qs('npmVersion'), npmUpdate: qs('npmUpdateBtn'),
        pnpmStatus: qs('pnpmStatus'), pnpmVersion: qs('pnpmVersion'), pnpmUpdate: qs('pnpmUpdateBtn'),
        dshStatus: qs('dshStatus'), dshVersion: qs('dshVersion'), dshUpdate: qs('dshUpdateBtn'),
        dshPluginBtn: qs('dshPluginBtn'), dshPluginStatus: qs('dshPluginStatus'), dshPluginVersion: qs('dshPluginVersion'),
        checkAll: qs('checkAllBtn'), updateLog: qs('updateLog'), restartBtn: qs('restartBtn'),
      },
      setupBanner: qs('setupBanner'),
    }

    // ── 更新 UI DOM（仅自动检查相关，更新状态由 Env 模块管理）──
    DOM.update = {
      autoCheckInput: qs('updateAutoCheckInput'), autoCheckDesc: qs('updateAutoCheckDesc'),
      skippedVersion: qs('updateSkippedVersion'),
    }

    // ── 状态 ──
    const state = {
      recorder: { shortcut: DEFAULT_SHORTCUT, draft: '', recording: false },
      autostart: { enabled: false, available: false, actuallySet: false, busy: false },
      env: {
        app: { checking: false, status: 'idle', version: '', latestVersion: '', progress: 0 },
        node: { ok: false, version: '', checking: false },
        npm: { ok: false, version: '', latestVersion: '', checking: false },
        pnpm: { ok: false, version: '', latestVersion: '', checking: false },
        dsh: { ok: false, version: '', latestVersion: '', checking: false },
        plugin: { installed: false, version: '', latestVersion: '', checking: false },
        globalChecking: false,
      },
    }

    // ── 环境检查模块 ──
    const Env = {
      renderOne: function (key) {
        const info = state.env[key]
        const dom = this.domFor(key)
        if (!dom) return
        const { versionEl, statusEl, updateBtn, refreshBtn } = dom
        if (info.checking) {
          versionEl.textContent = '...'; versionEl.classList.add('loading')
          statusEl.innerHTML = '<span class="status-dot loading"></span> 检测中...'
          if (updateBtn) updateBtn.disabled = true
          if (refreshBtn) refreshBtn.disabled = true
          return
        }
        versionEl.classList.remove('loading')
        if (key === 'app') {
          DOM.env.appDownload.style.display = 'none'
          DOM.env.appInstall.style.display = 'none'
          DOM.env.appProgress.style.display = 'none'
          if (refreshBtn) refreshBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>'
          switch (info.status) {
            case 'available':
              versionEl.textContent = 'v' + info.version + ' → v' + info.latestVersion
              statusEl.innerHTML = '<span class="status-dot warn"></span> 有新版本可用'
              DOM.env.appDownload.style.display = 'inline-flex'
              break
            case 'downloading':
              versionEl.textContent = 'v' + info.version + ' → v' + info.latestVersion
              statusEl.innerHTML = '<span class="status-dot loading"></span> 正在下载...'
              DOM.env.appProgress.style.display = 'flex'
              DOM.env.appFill.style.width = info.progress + '%'
              DOM.env.appProgressText.textContent = info.progress + '%'
              if (refreshBtn) refreshBtn.style.display = 'none'
              break
            case 'downloaded':
              versionEl.textContent = 'v' + info.version + ' → v' + info.latestVersion
              statusEl.innerHTML = '<span class="status-dot ok"></span> 下载完成，准备安装'
              DOM.env.appInstall.style.display = 'inline-flex'
              if (refreshBtn) refreshBtn.style.display = 'none'
              break
            case 'no-update':
              versionEl.textContent = 'v' + info.version
              statusEl.innerHTML = '<span class="status-dot ok"></span> 已是最新版本'
              break
            case 'error':
              versionEl.textContent = 'v' + info.version
              statusEl.innerHTML = '<span class="status-dot err"></span> ' + (info.latestVersion || '检查失败')
              break
            default:
              versionEl.textContent = 'v' + info.version
              statusEl.innerHTML = '<span class="status-dot loading"></span> 准备中...'
              break
          }
          if (refreshBtn) refreshBtn.disabled = (info.status === 'checking' || info.status === 'downloading' || info.status === 'downloaded')
          return
        }
        if (key === 'plugin') {
          if (info.installed) {
            const hasUpdate = info.latestVersion && info.version && info.latestVersion !== info.version
            if (hasUpdate) {
              versionEl.textContent = info.version + ' → ' + info.latestVersion
              statusEl.innerHTML = '<span class="status-dot warn"></span> 有新版本可用'
              if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>更新' }
            } else {
              versionEl.textContent = info.version
              statusEl.innerHTML = '<span class="status-dot ok"></span> 已安装'
              if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>检查更新' }
            }
          } else {
            versionEl.textContent = '未安装'
            statusEl.innerHTML = '<span class="status-dot err"></span> 未检测到'
            if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>安装' }
          }
        } else if (key === 'npm' || key === 'pnpm' || key === 'dsh') {
          if (info.ok) {
            const hasUpdate = info.latestVersion && info.version && info.latestVersion !== info.version
            if (hasUpdate) {
              versionEl.textContent = info.version + ' → ' + info.latestVersion
              statusEl.innerHTML = '<span class="status-dot warn"></span> 有新版本可用'
              if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>更新' }
            } else {
              versionEl.textContent = info.version
              statusEl.innerHTML = '<span class="status-dot ok"></span> 已安装'
              if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>检查更新' }
            }
          } else {
            versionEl.textContent = '未安装'
            statusEl.innerHTML = '<span class="status-dot err"></span> 未检测到'
            if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>安装' }
          }
        } else if (info.ok) {
          versionEl.textContent = info.version
          statusEl.innerHTML = '<span class="status-dot ok"></span> 已安装'
          if (updateBtn) updateBtn.disabled = false
        } else {
          versionEl.textContent = '未安装'
          statusEl.innerHTML = '<span class="status-dot err"></span> ' + (info.version || '未检测到')
          if (updateBtn && key === 'dsh') updateBtn.disabled = false
          else if (updateBtn) updateBtn.disabled = true
        }
        if (refreshBtn) refreshBtn.disabled = false
      },
      domFor: function (key) {
        if (key === 'node') return { versionEl: DOM.env.nodeVersion, statusEl: DOM.env.nodeStatus, updateBtn: null, refreshBtn: DOM.env.nodeRefresh }
        if (key === 'npm') return { versionEl: DOM.env.npmVersion, statusEl: DOM.env.npmStatus, updateBtn: DOM.env.npmUpdate, refreshBtn: null }
        if (key === 'pnpm') return { versionEl: DOM.env.pnpmVersion, statusEl: DOM.env.pnpmStatus, updateBtn: DOM.env.pnpmUpdate, refreshBtn: null }
        if (key === 'dsh') return { versionEl: DOM.env.dshVersion, statusEl: DOM.env.dshStatus, updateBtn: DOM.env.dshUpdate, refreshBtn: null }
        if (key === 'plugin') return { versionEl: DOM.env.dshPluginVersion, statusEl: DOM.env.dshPluginStatus, updateBtn: DOM.env.dshPluginBtn, refreshBtn: null }
        if (key === 'app') return { versionEl: DOM.env.appVersion, statusEl: DOM.env.appStatus, updateBtn: null, refreshBtn: DOM.env.appRefresh }
        return null
      },
      checkOne: function (key) {
        state.env[key].checking = true; this.renderOne(key)
        let p
        if (key === 'node') p = IPC.checkNode()
        else if (key === 'npm') p = IPC.checkNpm()
        else if (key === 'pnpm') p = IPC.checkPnpm()
        else if (key === 'dsh') p = IPC.checkDsh()
        else if (key === 'plugin') p = IPC.checkPlugin()
        else if (key === 'app') p = IPC.updateCheck().then(function (st) { return { status: st.status, latestVersion: st.version, error: st.error, progress: st.progress } })
        return p.then(function (result) {
          state.env[key].checking = false
          if (key === 'app') { state.env[key].status = result.status; state.env[key].version = (qs('appVersion').textContent || '').replace('v', ''); state.env[key].latestVersion = result.latestVersion || ''; state.env[key].progress = result.progress || 0 }
          else if (key === 'plugin') { state.env[key].installed = result.installed; state.env[key].version = result.version || ''; state.env[key].latestVersion = result.latestVersion || '' }
          else { state.env[key].ok = result.ok; state.env[key].version = result.version || ''; state.env[key].latestVersion = result.latestVersion || '' }
          Env.renderOne(key); Env.updateAllState()
          return result
        })
      },
      checkAll: function () {
        state.env.globalChecking = true; this.updateAllState()
        return Promise.all([this.checkOne('node'), this.checkOne('npm'), this.checkOne('pnpm'), this.checkOne('dsh'), this.checkOne('plugin'), this.checkOne('app')]).then(function () {
          state.env.globalChecking = false; Env.updateAllState()
        })
      },
      updateAllState: function () {
        const allOk = state.env.node.ok && state.env.npm.ok && state.env.pnpm.ok && state.env.dsh.ok
        DOM.env.checkAll.disabled = state.env.globalChecking
        DOM.env.checkAll.textContent = state.env.globalChecking ? '检测中...' : '重新检测全部'
        if (allOk && DOM.setupBanner) { DOM.setupBanner.style.display = 'none'; IPC.setupMarkDone() }
      },
      // 开始监听进度事件，实时输出到日志；返回取消监听的函数
      startProgress: function () {
        const el = DOM.env.updateLog
        el.className = 'update-log show'
        return IPC.onProgress(function (text) {
          el.textContent += text
          el.scrollTop = el.scrollHeight
        })
      },
      updateNpm: function () {
        DOM.env.npmUpdate.disabled = true; DOM.env.npmUpdate.textContent = '更新中...'
        const beforeVer = state.env.npm.version
        this.showLog('正在更新 npm 到最新版...\n', '')
        const stopProgress = this.startProgress()
        return IPC.updateNpm().then(function (res) {
          stopProgress()
          if (res.ok) {
            return Env.checkOne('npm').then(function () {
              const afterVer = state.env.npm.version
              if (beforeVer && afterVer && beforeVer !== afterVer) { Env.showLog('npm ' + beforeVer + ' → ' + afterVer + '  更新成功！\n', 'ok'); Toast.success('npm 已更新到 ' + afterVer) }
              else { Env.showLog('npm 已是最新版本 (' + afterVer + ')，无需更新\n', ''); Toast.info('npm 已是最新版本') }
            })
          } else { Env.showLog('npm 更新失败: ' + (res.error || '未知错误') + '\n', 'error'); Toast.error('npm 更新失败') }
        }).finally(function () { DOM.env.npmUpdate.disabled = false; Env.renderOne('npm') })
      },
      updateDsh: function () {
        DOM.env.dshUpdate.disabled = true; DOM.env.dshUpdate.textContent = '更新中...'
        const beforeVer = state.env.dsh.version
        this.showLog('正在更新 dsh 到最新版...\n', '')
        const stopProgress = this.startProgress()
        return IPC.updateDsh().then(function (res) {
          stopProgress()
          if (res.ok) {
            return Env.checkOne('dsh').then(function () {
              const afterVer = state.env.dsh.version
              if (beforeVer && afterVer && beforeVer !== afterVer) { Env.showLog('dsh ' + beforeVer + ' → ' + afterVer + '  更新成功！\n', 'ok'); Toast.success('dsh 已更新到 ' + afterVer) }
              else { Env.showLog('dsh 已是最新版本 (' + afterVer + ')，无需更新\n', ''); Toast.info('dsh 已是最新版本') }
            })
          } else { Env.showLog('dsh 更新失败: ' + (res.error || '未知错误') + '\n', 'error'); Toast.error('dsh 更新失败') }
        }).finally(function () { DOM.env.dshUpdate.disabled = false; Env.renderOne('dsh') })
      },
      updatePnpm: function () {
        DOM.env.pnpmUpdate.disabled = true; DOM.env.pnpmUpdate.textContent = '安装中...'
        this.showLog('正在通过 npm 全局安装 pnpm...\n', '')
        const stopProgress = this.startProgress()
        return IPC.updatePnpm().then(function (res) {
          stopProgress()
          if (res.ok) {
            return Env.checkOne('pnpm').then(function () {
              const afterVer = state.env.pnpm.version
              if (afterVer) { Env.showLog('pnpm ' + afterVer + ' 安装成功！\n', 'ok'); Toast.success('pnpm 已安装 ' + afterVer) }
              else { Env.showLog('pnpm 安装成功！\n', 'ok'); Toast.success('pnpm 安装成功') }
            })
          } else { Env.showLog('pnpm 安装失败: ' + (res.error || '未知错误') + '\n', 'error'); Toast.error('pnpm 安装失败，请检查 npm 是否正常') }
        }).finally(function () { DOM.env.pnpmUpdate.disabled = false; Env.renderOne('pnpm') })
      },
      updatePlugin: function () {
        DOM.env.dshPluginBtn.disabled = true; DOM.env.dshPluginBtn.textContent = '检测中...'
        this.showLog('正在检测 dshmarket 插件...\n', '')
        return IPC.checkPlugin().then(function (checkRes) {
          const beforeVer = checkRes.installed ? checkRes.version : '(未安装)'
          state.env.plugin.installed = checkRes.installed; state.env.plugin.version = checkRes.version || ''; state.env.plugin.latestVersion = checkRes.latestVersion || ''
          if (checkRes.installed) { Env.showLog('dshmarket 当前版本：' + beforeVer + '，正在更新到最新版...\n', ''); DOM.env.dshPluginBtn.textContent = '更新中...' }
          else { Env.showLog('dshmarket 未安装，正在安装...\n', ''); DOM.env.dshPluginBtn.textContent = '安装中...' }
          const stopProgress = Env.startProgress()
          return IPC.updatePlugin().then(function (res) {
            stopProgress()
            if (res.ok) {
              state.env.plugin.installed = true; state.env.plugin.version = res.afterVer || ''; state.env.plugin.latestVersion = ''
              const afterVer = res.afterVer || '?'
              if (beforeVer !== afterVer) { Env.showLog('dshmarket ' + beforeVer + ' → ' + afterVer + '  成功！\n', 'ok'); Toast.success('dshmarket 已更新到 ' + afterVer) }
              else { Env.showLog('dshmarket 已是最新版本（' + afterVer + '）\n', 'ok'); Toast.info('dshmarket 已是最新版本') }
              return Env.checkOne('plugin')
            } else { Env.showLog('dshmarket 安装/更新失败: ' + (res.error || '未知错误') + '\n', 'error'); Toast.error('dshmarket 安装/更新失败') }
          })
        }).finally(function () { DOM.env.dshPluginBtn.disabled = false; Env.renderOne('plugin') })
      },
      showLog: function (text, cls) {
        const el = DOM.env.updateLog
        el.textContent += text
        el.className = 'update-log show' + (cls ? ' ' + cls : '')
        el.scrollTop = el.scrollHeight
      },
    }

    // ── 快捷键录制模块 ──
    const Recorder = {
      render: function () {
        const r = state.recorder
        const preview = r.draft || (!r.recording ? r.shortcut : '')
        const text = preview ? formatShortcut(preview) : ''
        const placeholder = r.recording ? PLACEHOLDER_REC : PLACEHOLDER_IDLE
        const display = text || placeholder
        DOM.sizer.textContent = display; DOM.label.textContent = display
        DOM.label.classList.toggle('has-value', !!text && !r.recording)
        DOM.label.classList.toggle('is-recording', r.recording)
        DOM.resetBtn.disabled = r.shortcut === DEFAULT_SHORTCUT
      },
      start: function () { state.recorder.draft = ''; state.recorder.recording = true; this.render() },
      stop: function () { state.recorder.recording = false; if (state.recorder.draft) this.commit(state.recorder.draft); else this.render() },
      cancel: function () { state.recorder.recording = false; state.recorder.draft = state.recorder.shortcut; this.render() },
      clear: function () { state.recorder.recording = false; this.commit('') },
      commit: function (newValue) {
        const prev = state.recorder.shortcut
        state.recorder.shortcut = newValue; state.recorder.draft = newValue; this.render()
        return IPC.setShortcut('toggleWindow', newValue).then(function (ok) {
          if (!ok) { state.recorder.shortcut = prev; state.recorder.draft = prev; Recorder.render(); return }
          if (newValue) Toast.success('快捷键已更新'); else Toast.info('快捷键已清除')
        })
      },
    }

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
        IPC.restartDsh()
      })

      // 更新按钮
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
  }
})()