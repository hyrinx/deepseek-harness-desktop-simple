// ── 设置覆盖层注入脚本（注入到主窗口渲染进程） ──
// 在最外层套 IIFE 避免污染全局；CSS/HTML 由 windows.js 在注入时拼接。
// 模块代码已拆分到同目录下的 shortcut.js / toast.js / ipc.js / autostart.js /
// env.js / update.js / events.js，由 windows.js 的 getOverlayScript() 按顺序
// 拼接后替换 __DSH_SETTINGS_MODULES__ 占位符。
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
    const DEFAULT_SHORTCUT = __DSH_DEFAULT_SHORTCUT__

    function qs(id) { return document.getElementById('dsh-so-' + id) }

    // ── DOM 引用 ──
    const DOM = {
      sizer: qs('recorderSizer'), input: qs('recorderInput'), label: qs('recorderLabel'), resetBtn: qs('resetBtn'),
      autostart: { input: qs('autostartInput'), desc: qs('autostartDesc') },
      env: {
        appStatus: qs('appStatus'), appVersion: qs('appVersion'), appRefresh: qs('appRefreshBtn'),
        appDownload: qs('appDownloadBtn'), appInstall: qs('appInstallBtn'), appManual: qs('appManualBtn'),
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

    // __DSH_SETTINGS_MODULES__
  }
})()