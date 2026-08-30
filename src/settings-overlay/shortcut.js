// ── 快捷键常量与按键映射 ──
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