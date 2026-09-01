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
          if (key === 'node') DOM.env.nodejsProgress.style.display = 'none'
          return
        }
        versionEl.classList.remove('loading')
        // 工具（plugin/npm/pnpm/dsh）共用：已安装 → 检查更新/更新；未安装 → 安装
      const ICON_UPDATE = '<svg class="btn-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>'
      const ICON_DOWNLOAD = '<svg class="btn-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>'
      const ICON_PLUS = '<svg class="btn-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>'
      // 渲染一个"包工具"（plugin/npm/pnpm/dsh）：未安装 → 安装；有更新 → 更新；否则 → 检查更新
      const renderTool = function (info, updateBtn) {
        const uninstalled = info.installed === false || info.ok === false
        if (uninstalled) {
          versionEl.textContent = '未安装'
          statusEl.innerHTML = '<span class="status-dot err"></span> 未检测到'
          if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = ICON_PLUS + '安装' }
          return
        }
        const hasUpdate = Boolean(info.latestVersion && info.version && info.latestVersion !== info.version)
        if (hasUpdate) {
          versionEl.textContent = info.version + ' → ' + info.latestVersion
          statusEl.innerHTML = '<span class="status-dot warn"></span> 有新版本可用'
          if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = ICON_UPDATE + '更新' }
        } else {
          versionEl.textContent = info.version
          statusEl.innerHTML = '<span class="status-dot ok"></span> 已安装'
          if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = ICON_DOWNLOAD + '检查更新' }
        }
      }
      // 渲染"平台工具"（node 本地/全局）状态行
      const renderPlatformTool = function (info) {
        versionEl.textContent = info.version
        const pathInfo = info.localPath || info.globalPath || ''
        if (pathInfo) {
          statusEl.innerHTML = '<span class="status-dot ok"></span> 已安装 (' + pathInfo + ')'
          statusEl.title = pathInfo
        } else {
          statusEl.innerHTML = '<span class="status-dot ok"></span> 已安装（全局）'
        }
        if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = ICON_UPDATE + '检查更新' }
        DOM.env.nodejsProgress.style.display = 'none'
      }
        if (key === 'app') {
          DOM.env.appProgress.style.display = 'none'
          if (updateBtn) updateBtn.style.display = ''
          switch (info.status) {
            case 'available':
              versionEl.textContent = 'v' + info.version + ' → v' + info.latestVersion
              statusEl.innerHTML = '<span class="status-dot warn"></span> 有新版本可用'
              if (updateBtn) { updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>更新' }
              break
            case 'downloading':
              versionEl.textContent = 'v' + info.version + ' → v' + info.latestVersion
              statusEl.innerHTML = '<span class="status-dot loading"></span> 正在下载...'
              DOM.env.appProgress.style.display = 'flex'
              DOM.env.appFill.style.width = info.progress + '%'
              DOM.env.appProgressText.textContent = info.progress + '%'
              if (updateBtn) updateBtn.style.display = 'none'
              break
            case 'downloaded':
              versionEl.textContent = 'v' + info.version + ' → v' + info.latestVersion
              statusEl.innerHTML = '<span class="status-dot ok"></span> 下载完成，准备安装'
              if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>安装' }
              break
            case 'no-update':
              versionEl.textContent = 'v' + info.version
              statusEl.innerHTML = '<span class="status-dot ok"></span> 已是最新版本'
              if (updateBtn) { updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>检查更新' }
              break
            case 'error':
              versionEl.textContent = 'v' + info.version
              statusEl.innerHTML = '<span class="status-dot err"></span> ' + (info.latestVersion || '检查失败')
              if (updateBtn) { updateBtn.disabled = false; updateBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>检查更新' }
              break
            default:
              versionEl.textContent = 'v' + info.version
              statusEl.innerHTML = '<span class="status-dot loading"></span> 准备中...'
              if (updateBtn) updateBtn.disabled = true
              break
          }
          return
        }
        if (key === 'plugin' || key === 'npm' || key === 'pnpm' || key === 'dsh') {
          renderTool(info, updateBtn)
        } else {
          // node：本地已装则走平台工具；全局可用则 ok；否则未安装
          if (info.localInstalled === true || info.ok === true) {
            renderPlatformTool(info)
          } else {
            versionEl.textContent = '未安装'
            statusEl.innerHTML = '<span class="status-dot err"></span> ' + (info.version || '未检测到')
            if (updateBtn) { updateBtn.style.display = ''; updateBtn.disabled = false; updateBtn.innerHTML = ICON_DOWNLOAD + '安装' }
            DOM.env.nodejsProgress.style.display = 'none'
          }
        }
        if (refreshBtn) refreshBtn.disabled = false
      },
      domFor: function (key) {
        if (key === 'node') return { versionEl: DOM.env.nodeVersion, statusEl: DOM.env.nodeStatus, updateBtn: DOM.env.nodeUpdate, refreshBtn: null }
        if (key === 'npm') return { versionEl: DOM.env.npmVersion, statusEl: DOM.env.npmStatus, updateBtn: DOM.env.npmUpdate, refreshBtn: null }
        if (key === 'pnpm') return { versionEl: DOM.env.pnpmVersion, statusEl: DOM.env.pnpmStatus, updateBtn: DOM.env.pnpmUpdate, refreshBtn: null }
        if (key === 'dsh') return { versionEl: DOM.env.dshVersion, statusEl: DOM.env.dshStatus, updateBtn: DOM.env.dshUpdate, refreshBtn: null }
        if (key === 'plugin') return { versionEl: DOM.env.dshPluginVersion, statusEl: DOM.env.dshPluginStatus, updateBtn: DOM.env.dshPluginBtn, refreshBtn: null }
        if (key === 'app') return { versionEl: DOM.env.appVersion, statusEl: DOM.env.appStatus, updateBtn: DOM.env.appUpdate, refreshBtn: null }
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
        return Promise.all([this.checkOne('node'), this.checkOne('npm'), this.checkOne('pnpm'), this.checkOne('dsh'), this.checkOne('plugin'), this.checkOne('app'), this.checkNodejs()]).then(function () {
          state.env.globalChecking = false; Env.updateAllState()
        })
      },
      updateAllState: function () {
        const allOk = state.env.node.ok && state.env.npm.ok && state.env.pnpm.ok && state.env.dsh.ok
        DOM.env.checkAll.disabled = state.env.globalChecking
        DOM.env.checkAll.textContent = state.env.globalChecking ? '检测中...' : '重新检测全部'
        if (allOk && DOM.setupBanner) { DOM.setupBanner.style.display = 'none'; IPC.setupMarkDone() }
      },
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
      // Node.js 安装与状态
      checkNodejs: function () {
        return IPC.getNodejsStatus().then(function (res) {
          if (res.globalAvailable) {
            state.env.node.ok = true
            state.env.node.version = res.globalVersion
            state.env.node.globalPath = res.globalPath || ''
            state.env.node.localPath = ''
          } else if (res.localInstalled) {
            state.env.node.ok = true
            state.env.node.version = state.env.node.version || ''
            state.env.node.globalPath = ''
            state.env.node.localPath = res.localPath || ''
          } else {
            state.env.node.globalPath = ''
            state.env.node.localPath = ''
          }
          state.env.nodejs.downloading = false
          state.env.nodejs.downloadProgress = 0
          state.env.nodejs.downloadMessage = ''
          Env.renderOne('node')
          return res
        })
      },
      renderNodejs: function () {
        var info = state.env.nodejs
        var progress = DOM.env.nodejsProgress
        if (info.downloading) {
          DOM.env.nodeUpdate.style.display = 'none'
          progress.style.display = 'flex'
          DOM.env.nodejsFill.style.width = info.downloadProgress + '%'
          DOM.env.nodejsProgressText.textContent = info.downloadProgress + '%'
          return
        }
        progress.style.display = 'none'
      },
    }