// ── IPC 桥接（preload 暴露的 API）──
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
      getNodejsStatus: function () { try { return window.envAPI.getNodejsStatus() } catch (e) { return { globalAvailable: false, localInstalled: false, localPath: '', pathConfigured: false } } },
      getNodejsInstallPath: function () { try { return window.envAPI.getNodejsInstallPath() } catch (e) { return { path: '' } } },
      setNodejsInstallPath: function (path) { try { return window.envAPI.setNodejsInstallPath(path) } catch (e) { return false } },
      startNodejsDownload: function () { try { return window.envAPI.startNodejsDownload() } catch (e) { return { installed: false, reason: 'error', error: String(e) } } },
      onNodejsProgress: function (cb) { try { return window.envAPI.onNodejsProgress(cb) } catch (e) { return function () {} } },
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
      restartHost: function () { try { return window.appAPI.restartHost() } catch (e) { Toast.error('重启失败'); return false } },
    }