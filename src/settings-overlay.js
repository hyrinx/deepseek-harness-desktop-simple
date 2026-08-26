// ── 设置覆盖层注入脚本（注入到主窗口渲染进程） ──
// 在最外层套 IIFE 避免污染全局；内部函数放到 window 上供主进程调用。
(function() {
  if (window.__dshSettingsOverlayInjected) return
  window.__dshSettingsOverlayInjected = true

  // ════════════════════════════════════════════════
  // CSS（全部选择器用 #dsh-so 前缀隔离，不污染宿主页面）
  // ════════════════════════════════════════════════
  var css = document.createElement('style')
  css.id = 'dsh-so-style'
  css.textContent = [
    '#dsh-so { --blue:#1677ff;--blue-bg:#f0f7ff;--blue-border:#91caff;--green:#00b42a;--green-bg:#f0fff4;--green-border:#b7eb8f;--red:#f53f3f;--red-bg:#fff1f0;--red-border:#ffa39e;--orange:#ff7d00;--orange-bg:#fff7e8;--orange-border:#ffd591;--gray-50:#fafbfc;--gray-100:#f7f8fa;--gray-200:#f2f3f5;--gray-300:#ebeef0;--gray-400:#e5e6e8;--gray-500:#d9dbe0;--gray-600:#b0b4bd;--gray-700:#8a8f99;--gray-800:#4e5969;--gray-900:#1f2329;--radius:10px;--radius-sm:6px;--shadow-card:0 1px 3px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.06);--shadow-card-hover:0 4px 12px rgba(0,0,0,.08);--transition:.2s cubic-bezier(.4,0,.2,1);position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:"Segoe UI","Microsoft YaHei",system-ui,-apple-system,sans-serif;font-size:13px;color:var(--gray-900);-webkit-font-smoothing:antialiased}',
    '#dsh-so * {margin:0;padding:0;box-sizing:border-box}',
    '#dsh-so-backdrop {position:absolute;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}',
    '#dsh-so-panel {position:relative;width:560px;max-width:92vw;max-height:88vh;background:linear-gradient(135deg,#f5f7fa 0%,#eef1f5 100%);border-radius:var(--radius);box-shadow:0 20px 60px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;animation:dsh-so-in .25s ease-out}',
    '@keyframes dsh-so-in {from{opacity:0;transform:scale(.95) translateY(-8px)}to{opacity:1;transform:scale(1) translateY(0)}}',
    '#dsh-so-close {position:absolute;top:12px;right:14px;width:28px;height:28px;border:none;background:transparent;font-size:20px;color:var(--gray-600);cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;z-index:10;transition:all var(--transition)}',
    '#dsh-so-close:hover {background:rgba(0,0,0,.06);color:var(--gray-900)}',
    '#dsh-so .page {display:flex;flex-direction:column;overflow:hidden;flex:1;min-height:0}',
    '#dsh-so .header {flex-shrink:0;padding:16px 20px 0;display:flex;align-items:center;gap:10px}',
    '#dsh-so .header-logo {width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#1677ff 0%,#4dabf7 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex-shrink:0}',
    '#dsh-so .header-title {font-size:15px;font-weight:600;color:var(--gray-900);letter-spacing:-.01em}',
    '#dsh-so .header-sub {font-size:11px;color:var(--gray-700);margin-left:4px;font-weight:400}',
    '#dsh-so .tabs {flex-shrink:0;display:flex;gap:4px;margin:14px 20px 0;padding:4px;background:var(--gray-200);border-radius:var(--radius)}',
    '#dsh-so .tab-btn {flex:1;position:relative;padding:8px 12px;border:none;background:transparent;font-size:12.5px;font-weight:500;color:var(--gray-700);cursor:pointer;font-family:inherit;border-radius:7px;transition:all var(--transition);white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:5px}',
    '#dsh-so .tab-btn:hover {color:var(--gray-800);background:rgba(0,0,0,.04)}',
    '#dsh-so .tab-btn.active {color:var(--blue);background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
    '#dsh-so .tab-icon {width:14px;height:14px;flex-shrink:0}',
    '#dsh-so .tab-content {flex:1;overflow-y:auto;padding:14px 20px 20px;min-height:0}',
    '#dsh-so .tab-panel {display:none}',
    '#dsh-so .tab-panel.active {display:block}',
    '#dsh-so .card {background:#fff;border:1px solid var(--gray-300);border-radius:var(--radius);margin-bottom:12px;box-shadow:var(--shadow-card);transition:box-shadow var(--transition);overflow:hidden}',
    '#dsh-so .card:hover {box-shadow:var(--shadow-card-hover)}',
    '#dsh-so .card-title {padding:12px 16px;font-size:13px;font-weight:600;color:var(--gray-900);border-bottom:1px solid var(--gray-200);background:var(--gray-50);display:flex;align-items:center;gap:6px}',
    '#dsh-so .card-title .icon-dot {width:7px;height:7px;border-radius:50%;background:var(--blue);flex-shrink:0}',
    '#dsh-so .card-body {padding:16px}',
    '#dsh-so .env-row {display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--gray-200)}',
    '#dsh-so .env-row:last-child {border-bottom:none}',
    '#dsh-so .env-icon {width:36px;height:36px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff}',
    '#dsh-so .env-info {flex:1;min-width:0}',
    '#dsh-so .env-name {font-size:13px;font-weight:600;color:var(--gray-900);margin-bottom:2px}',
    '#dsh-so .env-status {font-size:11.5px;display:flex;align-items:center;gap:5px}',
    '#dsh-so .env-status .status-dot {width:6px;height:6px;border-radius:50%;flex-shrink:0}',
    '#dsh-so .status-dot.ok {background:var(--green)}',
    '#dsh-so .status-dot.err {background:var(--red)}',
    '#dsh-so .status-dot.loading {background:var(--blue);animation:dsh-so-pulse 1.2s ease-in-out infinite}',
    '#dsh-so .env-version {font-family:Consolas,"Cascadia Code","Courier New",monospace;font-size:12px;color:var(--gray-700);background:var(--gray-100);padding:2px 8px;border-radius:4px;flex-shrink:0;min-width:60px;text-align:center}',
    '#dsh-so .env-version.loading {color:var(--gray-600)}',
    '#dsh-so .env-actions {flex-shrink:0;display:flex;gap:6px}',
    '#dsh-so .btn {display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 12px;border:1px solid var(--gray-500);border-radius:var(--radius-sm);background:#fff;font-size:12px;color:var(--gray-800);cursor:pointer;transition:all var(--transition);font-family:inherit;gap:5px;white-space:nowrap}',
    '#dsh-so .btn:hover:not(:disabled) {color:var(--blue);border-color:var(--blue);background:var(--blue-bg)}',
    '#dsh-so .btn:active:not(:disabled) {background:#e6f0ff}',
    '#dsh-so .btn:disabled {cursor:not-allowed;color:var(--gray-600);background:var(--gray-100);border-color:var(--gray-400);opacity:.7}',
    '#dsh-so .btn-primary {border-color:var(--blue);background:var(--blue);color:#fff}',
    '#dsh-so .btn-primary:hover:not(:disabled) {background:#4096ff;border-color:#4096ff;color:#fff}',
    '#dsh-so .btn-primary:active:not(:disabled) {background:#0958d9}',
    '#dsh-so .btn-primary:disabled {background:var(--gray-400);border-color:var(--gray-400);color:#fff;opacity:.7}',
    '#dsh-so .btn-sm {height:26px;padding:0 10px;font-size:11.5px}',
    '#dsh-so .btn-icon {width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0}',
    '#dsh-so .shortcut-row {display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}',
    '#dsh-so .shortcut-info {flex:1;min-width:180px}',
    '#dsh-so .shortcut-name {font-size:13px;font-weight:500;color:var(--gray-900);margin-bottom:4px}',
    '#dsh-so .shortcut-desc {font-size:12px;color:var(--gray-700);line-height:1.5}',
    '#dsh-so .shortcut-actions {display:flex;align-items:center;gap:8px;flex-shrink:0}',
    '#dsh-so .recorder {position:relative;display:inline-block;min-width:160px;height:30px;vertical-align:middle}',
    '#dsh-so .recorder-sizer {display:block;visibility:hidden;height:30px;line-height:28px;padding:0 11px;white-space:pre;font-size:13px;font-weight:500}',
    '#dsh-so .recorder-input {position:absolute;inset:0;width:100%;height:30px;background:#fff;border:1px solid var(--gray-500);border-radius:var(--radius-sm);padding:0 11px;font-family:inherit;font-size:13px;color:transparent;caret-color:transparent;cursor:pointer;outline:none;transition:border-color var(--transition),box-shadow var(--transition)}',
    '#dsh-so .recorder-input:hover {border-color:var(--gray-600)}',
    '#dsh-so .recorder-input:focus {border-color:var(--blue);box-shadow:0 0 0 3px rgba(22,119,255,.12)}',
    '#dsh-so .recorder-label {position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;white-space:pre;font-size:13px;color:var(--gray-600);transition:color var(--transition)}',
    '#dsh-so .recorder-label.has-value {color:var(--blue);font-weight:600}',
    '#dsh-so .recorder-label.is-recording {color:var(--blue);animation:dsh-so-pulse-text 1.2s ease-in-out infinite}',
    '#dsh-so .setting-row {display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:4px 0}',
    '#dsh-so .setting-info {flex:1;min-width:0}',
    '#dsh-so .setting-name {font-size:13px;font-weight:500;color:var(--gray-900);margin-bottom:4px;line-height:1.5}',
    '#dsh-so .setting-desc {font-size:12px;color:var(--gray-700);line-height:1.6}',
    '#dsh-so .setting-desc.warn {color:var(--red)}',
    '#dsh-so .setting-control {flex-shrink:0;display:flex;align-items:center;height:30px}',
    '#dsh-so .switch {position:relative;display:inline-block;width:42px;height:24px;line-height:24px}',
    '#dsh-so .switch input {opacity:0;width:0;height:0;position:absolute}',
    '#dsh-so .switch-slider {position:absolute;cursor:pointer;inset:0;background-color:var(--gray-500);border-radius:24px;transition:background-color var(--transition)}',
    '#dsh-so .switch-slider::before {content:"";position:absolute;height:20px;width:20px;left:2px;top:2px;background-color:#fff;border-radius:50%;transition:transform var(--transition),box-shadow var(--transition);box-shadow:0 1px 3px rgba(0,0,0,.2)}',
    '#dsh-so .switch input:checked+.switch-slider {background-color:var(--blue)}',
    '#dsh-so .switch input:checked+.switch-slider::before {transform:translateX(18px)}',
    '#dsh-so .switch input:disabled+.switch-slider {cursor:not-allowed;background-color:var(--gray-400);opacity:.75}',
    '#dsh-so .switch input:disabled+.switch-slider::before {background-color:#f7f8fa}',
    '#dsh-so .about-list {list-style:none}',
    '#dsh-so .about-list li {display:flex;padding:9px 0;font-size:13px;line-height:1.6;border-bottom:1px solid var(--gray-200)}',
    '#dsh-so .about-list li:last-child {border-bottom:none}',
    '#dsh-so .about-label {width:72px;flex-shrink:0;color:var(--gray-700);font-weight:500}',
    '#dsh-so .about-value {flex:1;color:var(--gray-900);word-break:break-all}',
    '#dsh-so .about-value code {font-family:Consolas,"Cascadia Code",monospace;font-size:12px;background:var(--gray-100);padding:2px 6px;border-radius:4px}',
    '#dsh-so .setup-banner {background:linear-gradient(135deg,#e8f3ff 0%,#f0f7ff 100%);border:1px solid var(--blue-border);border-radius:var(--radius);padding:14px 16px;margin-bottom:12px;display:flex;align-items:center;gap:10px}',
    '#dsh-so .setup-banner .banner-icon {font-size:20px;flex-shrink:0}',
    '#dsh-so .setup-banner .banner-text {flex:1;font-size:12.5px;color:var(--gray-800);line-height:1.5}',
    '#dsh-so .setup-banner .banner-text strong {color:var(--blue)}',
    '#dsh-so .toast {position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-12px);padding:10px 18px;border-radius:var(--radius-sm);font-size:12.5px;font-weight:500;box-shadow:0 6px 20px rgba(0,0,0,.1);opacity:0;pointer-events:none;transition:opacity var(--transition),transform var(--transition);z-index:1000;display:flex;align-items:center;gap:7px;backdrop-filter:blur(8px)}',
    '#dsh-so .toast.show {opacity:1;transform:translateX(-50%) translateY(0)}',
    '#dsh-so .toast.success {background:rgba(240,255,244,.92);color:var(--green);border:1px solid var(--green-border)}',
    '#dsh-so .toast.info {background:rgba(240,247,255,.92);color:var(--blue);border:1px solid var(--blue-border)}',
    '#dsh-so .toast.error {background:rgba(255,241,240,.92);color:var(--red);border:1px solid var(--red-border)}',
    '#dsh-so .toast-dot {width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}',
    '#dsh-so .spin {display:inline-block;width:14px;height:14px;border:2px solid var(--gray-300);border-top-color:var(--blue);border-radius:50%;animation:dsh-so-spin .7s linear infinite;flex-shrink:0}',
    '#dsh-so .update-log {display:none;margin-top:8px;padding:10px;background:var(--gray-900);color:#a8d8a8;font-family:Consolas,"Cascadia Code","Courier New",monospace;font-size:11px;border-radius:var(--radius-sm);max-height:120px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;line-height:1.5}',
    '#dsh-so .update-log.show {display:block}',
    '#dsh-so .update-log.error {color:#ffa39e}',
    '@keyframes dsh-so-spin {to{transform:rotate(360deg)}}',
    '@keyframes dsh-so-pulse {0%,100%{opacity:1}50%{opacity:.35}}',
    '@keyframes dsh-so-pulse-text {0%,100%{opacity:1}50%{opacity:.5}}',
  ].join('\n')
  document.head.appendChild(css)

  // ════════════════════════════════════════════════
  // HTML 结构
  // ════════════════════════════════════════════════
  var overlay = document.createElement('div')
  overlay.id = 'dsh-so'
  overlay.style.display = 'none'
  overlay.innerHTML =
    '<div id="dsh-so-backdrop"></div>' +
    '<div id="dsh-so-panel">' +
      '<button id="dsh-so-close" title="关闭">&times;</button>' +
      '<div class="page">' +
        '<div class="header">' +
          '<div class="header-logo">DS</div>' +
          '<span class="header-title">DeepSeek Harness</span>' +
          '<span class="header-sub">设置</span>' +
        '</div>' +
        '<div class="tabs" id="dsh-so-tabNav">' +
          '<button class="tab-btn active" data-tab="env">' +
            '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>' +
            '环境</button>' +
          '<button class="tab-btn" data-tab="general">' +
            '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>' +
            '常规</button>' +
          '<button class="tab-btn" data-tab="about">' +
            '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>' +
            '关于</button>' +
        '</div>' +
        '<div class="tab-content">' +
          '<div class="tab-panel active" id="dsh-so-tab-env">' +
            '<div class="setup-banner" id="dsh-so-setupBanner"><span class="banner-icon">🛠️</span><span class="banner-text">首次使用前请检查系统环境。<strong>Node.js</strong> 和 <strong>dsh</strong> 是运行 DeepSeek Harness 的必要条件。</span></div>' +
            '<div class="card"><div class="card-title"><span class="icon-dot"></span>系统环境检查</div><div class="card-body">' +
              '<div class="env-row"><div class="env-icon" style="background:linear-gradient(135deg,#539e43 0%,#6cc24a 100%);">N</div><div class="env-info"><div class="env-name">Node.js 运行时</div><div class="env-status" id="dsh-so-nodeStatus"><span class="status-dot loading"></span> 检测中...</div></div><span class="env-version loading" id="dsh-so-nodeVersion">-</span><div class="env-actions"><button class="btn btn-sm" id="dsh-so-nodeRefreshBtn" disabled title="重新检测"><svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button></div></div>' +
              '<div class="env-row"><div class="env-icon" style="background:linear-gradient(135deg,#cb3837 0%,#e53e3e 100%);">n</div><div class="env-info"><div class="env-name">npm 包管理器</div><div class="env-status" id="dsh-so-npmStatus"><span class="status-dot loading"></span> 检测中...</div></div><span class="env-version loading" id="dsh-so-npmVersion">-</span><div class="env-actions"><button class="btn btn-sm btn-primary" id="dsh-so-npmUpdateBtn" disabled title="更新到最新版"><svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>更新</button></div></div>' +
              '<div class="env-row"><div class="env-icon" style="background:linear-gradient(135deg,#1677ff 0%,#4dabf7 100%);">D</div><div class="env-info"><div class="env-name">DeepSeek Harness CLI</div><div class="env-status" id="dsh-so-dshStatus"><span class="status-dot loading"></span> 检测中...</div></div><span class="env-version loading" id="dsh-so-dshVersion">-</span><div class="env-actions"><button class="btn btn-sm btn-primary" id="dsh-so-dshUpdateBtn" disabled title="更新到最新版"><svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>更新</button></div></div>' +
              '<div class="env-row"><div class="env-icon" style="background:linear-gradient(135deg,#8b5cf6 0%,#a78bfa 100%);">P</div><div class="env-info"><div class="env-name">dshmarket 插件</div><div class="env-status" id="dsh-so-dshPluginStatus"><span class="status-dot loading"></span> 检测中...</div></div><span class="env-version loading" id="dsh-so-dshPluginVersion">-</span><div class="env-actions"><button class="btn btn-sm btn-primary" id="dsh-so-dshPluginBtn" disabled title="安装 dshmarket 插件"><svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>安装插件市场</button></div></div>' +
              '<div class="update-log" id="dsh-so-updateLog"></div>' +
            '</div></div>' +
            '<div class="card" style="text-align:center;"><div class="card-body"><button class="btn btn-primary" id="dsh-so-checkAllBtn" disabled><svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>重新检测全部</button></div></div>' +
          '</div>' +
          '<div class="tab-panel" id="dsh-so-tab-general">' +
            '<div class="card"><div class="card-title"><span class="icon-dot"></span>启动行为</div><div class="card-body"><div class="setting-row"><div class="setting-info"><div class="setting-name">开机自动启动</div><div class="setting-desc" id="dsh-so-autostartDesc">登录 Windows 时自动启动（仅打包 .exe 后可用）</div></div><div class="setting-control"><label class="switch"><input type="checkbox" id="dsh-so-autostartInput" aria-label="开机自动启动开关"><span class="switch-slider"></span></label></div></div></div></div>' +
            '<div class="card"><div class="card-title"><span class="icon-dot"></span>快捷键</div><div class="card-body"><div class="shortcut-row"><div class="shortcut-info"><div class="shortcut-name">切换窗口显示 / 隐藏</div><div class="shortcut-desc">全局快捷键，在任何应用中都有效</div></div><div class="shortcut-actions"><div class="recorder" id="dsh-so-shortcutRecorder"><span class="recorder-sizer" id="dsh-so-recorderSizer" aria-hidden></span><input class="recorder-input" id="dsh-so-recorderInput" readonly><span class="recorder-label" id="dsh-so-recorderLabel">点击录制快捷键</span></div><button class="btn btn-sm" id="dsh-so-resetBtn" title="恢复默认"><svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>重置</button></div></div></div></div>' +
          '</div>' +
          '<div class="tab-panel" id="dsh-so-tab-about">' +
            '<div class="card"><div class="card-title"><span class="icon-dot"></span>关于</div><div class="card-body"><ul class="about-list"><li><span class="about-label">应用名称</span><span class="about-value">DeepSeek Harness Simple</span></li><li><span class="about-label">版本</span><span class="about-value"><code id="dsh-so-appVersion">0.1.0</code></span></li><li><span class="about-label">平台</span><span class="about-value"><code id="dsh-so-appPlatform">-</code></span></li><li><span class="about-label">说明</span><span class="about-value">DeepSeek 轻量桌面包装，基于 Electron</span></li></ul></div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="toast" id="dsh-so-toast"></div>'
  document.body.appendChild(overlay)

  // ════════════════════════════════════════════════
  // 显示/隐藏函数
  // ════════════════════════════════════════════════
  window.__dshShowSettingsOverlay = function() {
    overlay.style.display = 'flex'
    if (!overlay.__dshInited) {
      overlay.__dshInited = true
      initSettingsOverlay()
    }
  }
  window.__dshHideSettingsOverlay = function() {
    overlay.style.display = 'none'
  }

  // ════════════════════════════════════════════════
  // 设置页 JavaScript（从 settings.html 迁移并适配）
  // ════════════════════════════════════════════════
  function initSettingsOverlay() {
    var DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space'
    var PLACEHOLDER_IDLE = '点击录制快捷键'
    var PLACEHOLDER_REC = '按下组合键...'

    var CODE_TO_KEY = Object.assign(Object.create(null), {
      Space:'Space',Backspace:'Backspace',Delete:'Delete',Enter:'Enter',Escape:'Esc',Tab:'Tab',
      ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',
      Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDn',Insert:'Insert',CapsLock:'CapsLock',
      Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'
    })

    var KEY_DISPLAY = Object.assign(Object.create(null), {
      Space:'Space',Backspace:'⌫',Delete:'Del',Enter:'Enter',Escape:'Esc',Tab:'Tab',
      ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Up:'↑',Down:'↓',Left:'←',Right:'→',
      Home:'Home',End:'End',PageUp:'PgUp',PageDown:'PgDn',Control:'Ctrl',CommandOrControl:'Ctrl',
      Alt:'Alt',Shift:'Shift',Meta:'Win',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',
      BracketRight:']',Backslash:'\\\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',
      Insert:'Ins',CapsLock:'Caps'
    })

    var MODIFIER_NORMALIZE = Object.assign(Object.create(null), {
      ShiftLeft:'Shift',ShiftRight:'Shift',ControlLeft:'Control',ControlRight:'Control',
      AltLeft:'Alt',AltRight:'Alt',MetaLeft:'Meta',MetaRight:'Meta',OSLeft:'Meta',OSRight:'Meta'
    })

    var PURE_MODIFIER_KEYS = new Set(['Control','Alt','Shift','Meta','CommandOrControl'])

    function qs(id) { return document.getElementById('dsh-so-' + id) }

    function codeToAccelKey(code) {
      var n = MODIFIER_NORMALIZE[code]; if (n) return n
      if (code.startsWith('Key')) return code.slice(3)
      if (code.startsWith('Digit')) return code.slice(5)
      if (code.startsWith('Numpad')) return 'Num' + code.slice(6)
      if (/^F\\d+$/.test(code)) return code
      return CODE_TO_KEY[code] || code
    }

    function eventToAccelerator(e) {
      var modifiers = []
      if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl')
      if (e.altKey) modifiers.push('Alt')
      if (e.shiftKey) modifiers.push('Shift')
      var key = codeToAccelKey(e.code)
      if (PURE_MODIFIER_KEYS.has(key)) return modifiers.length ? modifiers.join('+') : null
      modifiers.push(key)
      if (/^F\\d+$/.test(key) || modifiers.length >= 2) return modifiers.join('+')
      return null
    }

    function formatShortcut(raw) {
      if (!raw) return ''
      return raw.split('+').map(function(k) { return KEY_DISPLAY[k] || k }).join(' + ')
    }

    // Toast
    var Toast = (function() {
      var el = qs('toast')
      var timer = null
      function show(msg, type, duration) {
        type = type || 'info'; duration = duration || 2000
        el.className = 'toast ' + type
        el.innerHTML = '<span class="toast-dot"></span>' + msg
        void el.offsetWidth
        el.classList.add('show')
        clearTimeout(timer)
        timer = setTimeout(function() { el.classList.remove('show') }, duration)
      }
      return { success:function(m){show(m,'success')}, info:function(m){show(m,'info')}, error:function(m){show(m,'error')} }
    })()

    // IPC
    var IPC = {
      getSettings: function() { try { return window.settingsAPI.getSettings() } catch(e) { return {} } },
      setShortcut: function(name, value) { try { return window.settingsAPI.setShortcut(name, value) } catch(e) { Toast.error('保存失败'); return false } },
      getAutoStart: function() { try { return window.settingsAPI.getAutoStart() } catch(e) { return {enabled:false,available:false,actuallySet:false} } },
      setAutoStart: function(enabled) { try { return window.settingsAPI.setAutoStart(enabled) } catch(e) { Toast.error('设置失败'); return null } },
      fillAboutInfo: function() {
        Promise.all([
          window.settingsAPI.getPlatform().catch(function(){ return '-' }),
          window.settingsAPI.getVersion().catch(function(){ return '0.1.0' })
        ]).then(function(r) {
          qs('appPlatform').textContent = r[0]
          qs('appVersion').textContent = r[1]
        })
      },
      checkNode: function() { try { return window.envAPI.checkNode() } catch(e) { return {ok:false,error:String(e),version:''} } },
      checkNpm: function() { try { return window.envAPI.checkNpm() } catch(e) { return {ok:false,error:String(e),version:''} } },
      checkDsh: function() { try { return window.envAPI.checkDsh() } catch(e) { return {ok:false,error:String(e),version:''} } },
      updateNpm: function() { try { return window.envAPI.updateNpm() } catch(e) { return {ok:false,error:String(e),output:''} } },
      updateDsh: function() { try { return window.envAPI.updateDsh() } catch(e) { return {ok:false,error:String(e),output:''} } },
      checkPlugin: function() { try { return window.envAPI.checkPlugin() } catch(e) { return {installed:false,version:'',error:String(e)} } },
      updatePlugin: function() { try { return window.envAPI.updatePlugin() } catch(e) { return {ok:false,error:String(e),output:'',beforeVer:'',afterVer:''} } },
      setupMarkDone: function() { try { return window.setupAPI.markDone() } catch(e) { return false } },
    }

    // DOM refs
    var DOM = {
      sizer: qs('recorderSizer'), input: qs('recorderInput'), label: qs('recorderLabel'), resetBtn: qs('resetBtn'),
      autostart: { input: qs('autostartInput'), desc: qs('autostartDesc') },
      env: {
        nodeStatus: qs('nodeStatus'), nodeVersion: qs('nodeVersion'), nodeRefresh: qs('nodeRefreshBtn'),
        npmStatus: qs('npmStatus'), npmVersion: qs('npmVersion'), npmUpdate: qs('npmUpdateBtn'),
        dshStatus: qs('dshStatus'), dshVersion: qs('dshVersion'), dshUpdate: qs('dshUpdateBtn'),
        dshPluginBtn: qs('dshPluginBtn'), dshPluginStatus: qs('dshPluginStatus'), dshPluginVersion: qs('dshPluginVersion'),
        checkAll: qs('checkAllBtn'), updateLog: qs('updateLog')
      },
      setupBanner: qs('setupBanner')
    }

    var state = {
      recorder: { shortcut: DEFAULT_SHORTCUT, draft: '', recording: false },
      autostart: { enabled: false, available: false, actuallySet: false, busy: false },
      env: {
        node: { ok: false, version: '', checking: false },
        npm: { ok: false, version: '', checking: false },
        dsh: { ok: false, version: '', checking: false },
        plugin: { installed: false, version: '', checking: false },
        globalChecking: false
      }
    }

    var Env = {
      renderOne: function(key) {
        var info = state.env[key]
        var dom = this.domFor(key)
        if (!dom) return
        var verEl = dom.versionEl, statusEl = dom.statusEl, updateBtn = dom.updateBtn, refreshBtn = dom.refreshBtn
        if (info.checking) {
          verEl.textContent = '...'; verEl.classList.add('loading')
          statusEl.innerHTML = '<span class="status-dot loading"></span> 检测中...'
          if (updateBtn) updateBtn.disabled = true
          if (refreshBtn) refreshBtn.disabled = true
          return
        }
        verEl.classList.remove('loading')
        if (key === 'plugin') {
          if (info.installed) {
            verEl.textContent = info.version
            statusEl.innerHTML = '<span class="status-dot ok"></span> 已安装'
            if (updateBtn) { updateBtn.disabled = false; updateBtn.textContent = '更新插件市场' }
          } else {
            verEl.textContent = '未安装'
            statusEl.innerHTML = '<span class="status-dot err"></span> 未检测到'
            if (updateBtn) { updateBtn.disabled = false; updateBtn.textContent = '安装插件市场' }
          }
        } else if (info.ok) {
          verEl.textContent = info.version
          statusEl.innerHTML = '<span class="status-dot ok"></span> 已安装'
          if (updateBtn) updateBtn.disabled = false
        } else {
          verEl.textContent = '未安装'
          statusEl.innerHTML = '<span class="status-dot err"></span> ' + (info.version || '未检测到')
          if (updateBtn && key === 'dsh') updateBtn.disabled = false
          else if (updateBtn) updateBtn.disabled = true
        }
        if (refreshBtn) refreshBtn.disabled = false
      },
      domFor: function(key) {
        if (key === 'node') return { versionEl: DOM.env.nodeVersion, statusEl: DOM.env.nodeStatus, updateBtn: null, refreshBtn: DOM.env.nodeRefresh }
        if (key === 'npm') return { versionEl: DOM.env.npmVersion, statusEl: DOM.env.npmStatus, updateBtn: DOM.env.npmUpdate, refreshBtn: null }
        if (key === 'dsh') return { versionEl: DOM.env.dshVersion, statusEl: DOM.env.dshStatus, updateBtn: DOM.env.dshUpdate, refreshBtn: null }
        if (key === 'plugin') return { versionEl: DOM.env.dshPluginVersion, statusEl: DOM.env.dshPluginStatus, updateBtn: DOM.env.dshPluginBtn, refreshBtn: null }
        return null
      },
      checkOne: function(key) {
        state.env[key].checking = true; this.renderOne(key)
        var p
        if (key === 'node') p = IPC.checkNode()
        else if (key === 'npm') p = IPC.checkNpm()
        else if (key === 'dsh') p = IPC.checkDsh()
        else if (key === 'plugin') p = IPC.checkPlugin()
        return p.then(function(result) {
          state.env[key].checking = false
          if (key === 'plugin') { state.env[key].installed = result.installed; state.env[key].version = result.version || '' }
          else { state.env[key].ok = result.ok; state.env[key].version = result.version || '' }
          Env.renderOne(key); Env.updateAllState()
          return result
        })
      },
      checkAll: function() {
        state.env.globalChecking = true; this.updateAllState()
        return Promise.all([this.checkOne('node'), this.checkOne('npm'), this.checkOne('dsh'), this.checkOne('plugin')]).then(function() {
          state.env.globalChecking = false; Env.updateAllState()
        })
      },
      updateAllState: function() {
        var allOk = state.env.node.ok && state.env.npm.ok && state.env.dsh.ok
        DOM.env.checkAll.disabled = state.env.globalChecking
        DOM.env.checkAll.textContent = state.env.globalChecking ? '检测中...' : '重新检测全部'
        if (allOk && DOM.setupBanner) { DOM.setupBanner.style.display = 'none'; IPC.setupMarkDone() }
      },
      updateNpm: function() {
        DOM.env.npmUpdate.disabled = true; DOM.env.npmUpdate.textContent = '更新中...'
        var beforeVer = state.env.npm.version
        this.showLog('正在更新 npm 到最新版...\\n', '')
        return IPC.updateNpm().then(function(res) {
          Env.showLog(res.output + '\\n', res.ok ? '' : 'error')
          if (res.ok) {
            return Env.checkOne('npm').then(function() {
              var afterVer = state.env.npm.version
              if (beforeVer && afterVer && beforeVer !== afterVer) { Env.showLog('npm ' + beforeVer + ' → ' + afterVer + '  更新成功！', 'ok'); Toast.success('npm 已更新到 ' + afterVer) }
              else { Env.showLog('npm 已是最新版本 (' + afterVer + ')，无需更新', ''); Toast.info('npm 已是最新版本') }
            })
          } else { Toast.error('npm 更新失败') }
        }).finally(function() { DOM.env.npmUpdate.disabled = false; DOM.env.npmUpdate.textContent = '更新' })
      },
      updateDsh: function() {
        DOM.env.dshUpdate.disabled = true; DOM.env.dshUpdate.textContent = '更新中...'
        var beforeVer = state.env.dsh.version
        this.showLog('正在更新 dsh 到最新版...\\n', '')
        return IPC.updateDsh().then(function(res) {
          Env.showLog(res.output + '\\n', res.ok ? '' : 'error')
          if (res.ok) {
            return Env.checkOne('dsh').then(function() {
              var afterVer = state.env.dsh.version
              if (beforeVer && afterVer && beforeVer !== afterVer) { Env.showLog('dsh ' + beforeVer + ' → ' + afterVer + '  更新成功！', 'ok'); Toast.success('dsh 已更新到 ' + afterVer) }
              else { Env.showLog('dsh 已是最新版本 (' + afterVer + ')，无需更新', ''); Toast.info('dsh 已是最新版本') }
            })
          } else { Toast.error('dsh 更新失败') }
        }).finally(function() { DOM.env.dshUpdate.disabled = false; DOM.env.dshUpdate.textContent = '更新' })
      },
      updatePlugin: function() {
        DOM.env.dshPluginBtn.disabled = true; DOM.env.dshPluginBtn.textContent = '检测中...'
        this.showLog('正在检测 dshmarket 插件...\\n', '')
        return IPC.checkPlugin().then(function(checkRes) {
          var beforeVer = checkRes.installed ? checkRes.version : '(未安装)'
          state.env.plugin.installed = checkRes.installed; state.env.plugin.version = checkRes.version || ''
          if (checkRes.installed) { Env.showLog('dshmarket 当前版本：' + beforeVer + '，正在更新到最新版...\\n', ''); DOM.env.dshPluginBtn.textContent = '更新中...' }
          else { Env.showLog('dshmarket 未安装，正在安装...\\n', ''); DOM.env.dshPluginBtn.textContent = '安装中...' }
          return IPC.updatePlugin().then(function(res) {
            Env.showLog(res.output + '\\n', res.ok ? '' : 'error')
            if (res.ok) {
              return IPC.checkPlugin().then(function(afterCheck) {
                state.env.plugin.installed = afterCheck.installed; state.env.plugin.version = afterCheck.version || ''
                var afterVer = afterCheck.installed ? afterCheck.version : '?'
                if (beforeVer !== afterVer) { Env.showLog('dshmarket ' + beforeVer + ' → ' + afterVer + '  成功！', 'ok'); Toast.success('dshmarket 已更新到 ' + afterVer) }
                else { Env.showLog('dshmarket 已是最新版本（' + afterVer + '）', 'ok'); Toast.info('dshmarket 已是最新版本') }
                Env.renderOne('plugin')
              })
            } else { Toast.error('dshmarket 安装/更新失败'); DOM.env.dshPluginStatus.innerHTML = '<span class="status-dot err"></span> 操作失败，请重试' }
          })
        }).finally(function() { DOM.env.dshPluginBtn.disabled = false; DOM.env.dshPluginBtn.textContent = state.env.plugin.installed ? '更新插件市场' : '安装插件市场' })
      },
      showLog: function(text, cls) {
        var el = DOM.env.updateLog
        el.textContent += text
        el.className = 'update-log show' + (cls ? ' ' + cls : '')
        el.scrollTop = el.scrollHeight
      }
    }

    var Recorder = {
      render: function() {
        var r = state.recorder
        var preview = r.draft || (!r.recording ? r.shortcut : '')
        var text = preview ? formatShortcut(preview) : ''
        var placeholder = r.recording ? PLACEHOLDER_REC : PLACEHOLDER_IDLE
        var display = text || placeholder
        DOM.sizer.textContent = display; DOM.label.textContent = display
        DOM.label.classList.toggle('has-value', !!text && !r.recording)
        DOM.label.classList.toggle('is-recording', r.recording)
        DOM.resetBtn.disabled = r.shortcut === DEFAULT_SHORTCUT
      },
      start: function() { state.recorder.draft = ''; state.recorder.recording = true; this.render() },
      stop: function() { state.recorder.recording = false; if (state.recorder.draft) this.commit(state.recorder.draft); else this.render() },
      cancel: function() { state.recorder.recording = false; state.recorder.draft = state.recorder.shortcut; this.render() },
      clear: function() { state.recorder.recording = false; this.commit('') },
      commit: function(newValue) {
        var prev = state.recorder.shortcut
        state.recorder.shortcut = newValue; state.recorder.draft = newValue; this.render()
        return IPC.setShortcut('toggleWindow', newValue).then(function(ok) {
          if (!ok) { state.recorder.shortcut = prev; state.recorder.draft = prev; Recorder.render(); return }
          if (newValue) Toast.success('快捷键已更新'); else Toast.info('快捷键已清除')
        })
      }
    }

    var AutoStart = {
      render: function() {
        var a = state.autostart
        DOM.autostart.input.checked = a.enabled
        DOM.autostart.input.disabled = !a.available || a.busy
        if (!a.available) { DOM.autostart.desc.textContent = '该功能仅在打包为 .exe 安装版后可用（调试模式下无法修改）'; DOM.autostart.desc.classList.add('warn') }
        else { DOM.autostart.desc.textContent = '登录 Windows 时自动启动本应用（自动启动仅出现在系统托盘，不主动显示窗口）'; DOM.autostart.desc.classList.remove('warn') }
      },
      load: function() {
        return IPC.getAutoStart().then(function(res) {
          state.autostart.enabled = Boolean(res && res.enabled)
          state.autostart.available = Boolean(res && res.available)
          state.autostart.actuallySet = Boolean(res && res.actuallySet)
          AutoStart.render()
        })
      },
      commit: function(nextEnabled) {
        if (state.autostart.busy) return
        if (!state.autostart.available) { Toast.info('打包为 .exe 后可使用此功能'); this.render(); return }
        var prev = state.autostart.enabled
        state.autostart.enabled = nextEnabled; state.autostart.busy = true; this.render()
        return IPC.setAutoStart(nextEnabled).then(function(res) {
          state.autostart.busy = false
          if (!res) { state.autostart.enabled = prev; AutoStart.render(); return }
          state.autostart.enabled = Boolean(res.enabled); state.autostart.actuallySet = Boolean(res.actuallySet)
          AutoStart.render()
          Toast.success(nextEnabled ? '已开启开机自启' : '已关闭开机自启')
        })
      }
    }

    function bindEvents() {
      // 标签页切换
      var tabBtns = overlay.querySelectorAll('.tab-btn')
      var tabPanels = overlay.querySelectorAll('.tab-panel')
      tabBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var targetTab = btn.dataset.tab
          tabBtns.forEach(function(b) { b.classList.remove('active') })
          btn.classList.add('active')
          tabPanels.forEach(function(p) { p.classList.remove('active') })
          var targetPanel = qs('tab-' + targetTab)
          if (targetPanel) targetPanel.classList.add('active')
        })
      })

      // 快捷键录制
      DOM.input.addEventListener('focus', function() { Recorder.start() })
      DOM.input.addEventListener('blur', function() { if (state.recorder.recording) Recorder.stop() })
      DOM.autostart.input.addEventListener('change', function(e) { AutoStart.commit(Boolean(e.target.checked)) })

      // 键盘事件（在 overlay 上监听，捕获阶段）
      overlay.addEventListener('keydown', function(e) {
        if (state.recorder.recording) {
          e.preventDefault(); e.stopPropagation()
          var noMod = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
          if (noMod && (e.key === 'Backspace' || e.key === 'Delete')) { DOM.input.blur(); Recorder.clear(); return }
          if (e.key === 'Escape') { DOM.input.blur(); Recorder.cancel(); return }
          var accel = eventToAccelerator(e)
          if (!accel) return
          state.recorder.draft = accel
          var parts = accel.split('+'), last = parts[parts.length - 1]
          if (!PURE_MODIFIER_KEYS.has(last) && parts.length >= 2) { DOM.input.blur(); state.recorder.recording = false; Recorder.commit(accel) }
          else Recorder.render()
          return
        }
        if (e.key === 'Escape') { window.__dshHideSettingsOverlay(); return }
      }, true)

      DOM.resetBtn.addEventListener('click', function() {
        state.recorder.recording = false
        Recorder.commit(DEFAULT_SHORTCUT).then(function() { Toast.success('已恢复默认快捷键') })
      })

      // 环境检查按钮
      DOM.env.checkAll.addEventListener('click', function() { Env.checkAll() })
      DOM.env.nodeRefresh.addEventListener('click', function() { Env.checkOne('node') })
      DOM.env.npmUpdate.addEventListener('click', function() { Env.updateNpm() })
      DOM.env.dshUpdate.addEventListener('click', function() { Env.updateDsh() })
      DOM.env.dshPluginBtn.addEventListener('click', function() { Env.updatePlugin() })
    }

    // 关闭按钮
    qs('close').addEventListener('click', function() { window.__dshHideSettingsOverlay() })
    // 点击遮罩关闭
    document.getElementById('dsh-so-backdrop').addEventListener('click', function() { window.__dshHideSettingsOverlay() })
    // 点击面板内部不关闭
    document.getElementById('dsh-so-panel').addEventListener('click', function(e) { e.stopPropagation() })

    // 初始化
    Promise.all([IPC.getSettings(), IPC.fillAboutInfo(), AutoStart.load(), Env.checkAll()]).then(function(r) {
      var settings = r[0]
      var saved = settings && settings.shortcuts && settings.shortcuts.toggleWindow
      if (saved !== undefined && saved !== null) { state.recorder.shortcut = saved; state.recorder.draft = saved }
      Recorder.render()
      bindEvents()
    }).catch(function(e) {
      console.error('[settings-overlay] 初始化失败', e)
      Toast.error('初始化失败')
    })
  }
})()