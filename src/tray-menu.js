// ═══════════════════════════════════════════════════════════════
// 托盘菜单：常量 + 内联 HTML（electron-menubar 接管 BrowserWindow，
// 这里只保留视觉层的 HTML/尺寸/preload 常量，菜单窗口管理在 tray.js）。
//
// 注意：修改下方 CSS/MENU_HEIGHT 时请同步更新 MENU_HEIGHT 计算。
// ═══════════════════════════════════════════════════════════════

const { join } = require('node:path')

const PRELOAD_PATH = join(__dirname, '..', 'preload', 'preload.js')

// 菜单外框尺寸（必须与下方 HTML/CSS 保持一致）
const MENU_WIDTH = 160
const MENU_PADDING = 4          // .menu padding（对称）
const MENU_ITEM_HEIGHT = 30     // .item height
const MENU_GAP = 2              // .item gap
const MENU_SEPARATOR_HEIGHT = 9 // .sep（1px 线 + 上下 margin 各 4）
const MENU_BORDER = 2           // 上下 border 各 1

// 行序：打开主窗口 / 偏好设置 / 查看日志 / 分隔线 / 重启 / 退出（共 5 项 + 1 分隔线）
const MENU_HEIGHT = MENU_PADDING * 2
  + MENU_ITEM_HEIGHT * 5
  + MENU_GAP * 5
  + MENU_SEPARATOR_HEIGHT
  + MENU_BORDER

const MENU_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; background: transparent; }
  body {
    font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    font-size: 13px;
    color: #1f2329;
  }
  .menu {
    width: 100%;
    height: 100%;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, .12);
    border-radius: 6px;
    padding: ${MENU_PADDING}px;
    display: flex;
    flex-direction: column;
    gap: ${MENU_GAP}px;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  }
  .item {
    height: ${MENU_ITEM_HEIGHT}px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-radius: 4px;
    cursor: default;
  }
  .item:hover { background: #eef0f3; }
  .item:active { background: #e2e5ea; }
  .sep { height: 1px; background: #e5e6e8; margin: 4px 8px; }
</style>
</head>
<body>
  <div class="menu">
    <div class="item" data-action="show">打开主窗口</div>
    <div class="item" data-action="settings">偏好设置</div>
    <div class="item" data-action="logs">查看日志</div>
    <div class="sep"></div>
    <div class="item" data-action="restart">重启</div>
    <div class="item" data-action="quit">退出</div>
  </div>
  <script>
    document.querySelectorAll('.item').forEach(function(el) {
      el.addEventListener('click', function() {
        var action = this.getAttribute('data-action')
        if (action) window.electronAPI.ipc.send('tray-menu-select', action)
      })
    })
  </script>
</body>
</html>`

module.exports = {
  MENU_HTML,
  PRELOAD_PATH,
  MENU_WIDTH,
  MENU_HEIGHT,
}