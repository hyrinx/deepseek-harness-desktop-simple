<div align="center">
  <img src="./assets/favicon.svg" alt="DeepSeek Harness" width="96" height="96" />
</div>

## 📖 关于

DeepSeek Harness Desktop 是一个基于 Electron 的轻量桌面壳，采用 Native-First 架构：
主进程仅依赖 Node.js 内置模块，零第三方运行时依赖，前端纯原生 HTML/CSS/JS，
不引入任何框架。

它不捆绑 DeepSeek 本体，而是直接调用系统已安装的 `dsh web` CLI 拉起本地
Web 服务，再用 BrowserWindow 嵌入展示。你需要先在系统中安装 Node.js 和
DeepSeek Harness CLI，桌面壳负责窗口管理、托盘、快捷键和安全隔离。

## ✨ 功能

- 🚀 调用系统 `dsh web` 启动本地 Web 服务，BrowserWindow 嵌入展示；
  启动失败（dsh 未安装）则弹窗提示并退出
- 🪟 Windows 下 Acrylic 亚克力背景 + 透明 `titleBarOverlay`；
  macOS 下 `hiddenInset` 红绿灯 + sidebar 毛玻璃振动
- 🎨 悬浮标题栏拖拽：纯 DOM 事件 → `setBounds` 显式钉住宽高，
  规避 Electron `setPosition` 篡改尺寸的核心 bug，
  4px 阈值防误触，交互控件零遮挡
- 📋 自绘托盘菜单：无边框透明圆角 + 悬浮高亮 + 失焦防抖隐藏 + 智能定位
  （菜单在鼠标右上角弹出）；左键单击显隐主窗口，右键打开菜单
- ⌨️ 全局快捷键显示/隐藏主窗口，默认 `Ctrl+Shift+Space`，设置页支持实时录制
- 🔋 开机自启（打包后生效），静默启动时只出托盘不弹窗口
- ⚙️ 设置页纯原生实现，三个标签页：
    - **常规** — 快捷键录制器 + 开机自启 Switch + 乐观更新 + Toast 提示
    - **日志** — 日志文件列表、打开/删除、按天查看尾部内容
    - **关于** — 应用版本、运行平台
- 🔒 安全加固：`contextIsolation` + `sandbox` + 权限拒绝 +
  导航限制 + 外部链接用浏览器打开 + 弹窗 deny
- 🧹 退出时进程树终止（Windows 下 `taskkill /t`），单实例锁防多开，
  第二实例自动唤起主窗口；关闭主窗口时隐藏到托盘而非退出
- 🔄 托盘菜单支持应用重启，重启前清理 UI 和子进程
- 📝 完整日志系统：按天写入 `logs/host-YYYY-MM-DD.log`，
  结构化事件日志（打包后控制台只输出 error），进程守卫捕获未处理异常
- 💾 用户偏好持久化到 `config.json`（exe 同目录）

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18（需在系统 PATH 中可用）
- DeepSeek Harness CLI（`dsh` 命令需在系统 PATH 中可用）

### 📦 安装桌面外壳

```bash
git clone https://github.com/hyrinx/DeepSeek-Harness-Desktop.git
cd DeepSeek-Harness-Desktop
npm install
```

### 🔌 安装「打开方式」插件（dsh-plugin-open-with）

插件已发布到 npm，通过包名安装：

```bash
# 加入 Web profile 并验证版本号
dsh --profile web plugin add dsh-plugin-open-with
dsh --profile web plugin list dsh-plugin-open-with --depth=0

# 重启 DSH Web 让插件生效
dsh web restart
```

> 插件 npm 页面：
> [https://www.npmjs.com/package/dsh-plugin-open-with](https://www.npmjs.com/package/dsh-plugin-open-with)
> 安装后若按钮未出现，先退出桌面壳再重开。

### 🛠️ 开发

项目结构

```
DeepSeek Harness/
├── main.js                  # 入口（单实例锁 + app 事件 + 启动调度）
├── settings.html            # 设置页（内联 CSS/JS，常规 / 日志 / 关于）
├── src/
│   ├── autostart.js         # 开机自启管理
│   ├── constants.js         # 常量与纯工具函数
│   ├── host.js              # dsh web 子进程管理（spawn / 就绪 / 终止）
│   ├── ipc.js               # IPC 处理器（设置 / 日志 / 拖拽 / 窗口控制）
│   ├── lifecycle.js         # 应用生命周期（bootstrap / 退出 / 重启）
│   ├── state.js             # 全局状态 + 日志基础设施 + 进程守卫
│   ├── store.js             # 配置存储（config.json）
│   ├── tray-menu.js         # 自绘托盘菜单（HTML 模板 + 智能定位）
│   ├── tray.js              # 托盘图标管理（electron-menubar 封装）
│   └── windows.js           # 窗口管理（创建 / 导航 / 显示切换）
├── preload/
│   ├── preload.js           # 托盘菜单 preload
│   ├── preload-main.js      # 主窗口 preload（拖拽 API）
│   └── preload-settings.js  # 设置页 preload
├── assets/
│   ├── app.ico
│   ├── favicon.ico
│   └── favicon.svg
└── package.json
```

## ⚙️ 配置

用户偏好持久化到 `config.json`（位于 exe 同目录）：

```json
{
  "shortcuts": {
    "toggleWindow": "CommandOrControl+Shift+Space"
  },
  "ui": {
    "autoStart": false
  }
}
```

## 📄 开源协议

基于 [MIT License](./LICENSE) 开源。