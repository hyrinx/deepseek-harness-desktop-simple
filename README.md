<div align="center">
  <img src="./assets/favicon.svg" alt="DeepSeek Harness Desktop" width="96" height="96" />
  <h1>DeepSeek Harness Desktop</h1>
  <p>基于 Electron 的轻量级 DeepSeek Harness 桌面壳 · Native-First · 零框架</p>
  <p>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
    <img src="https://img.shields.io/badge/Electron-43-47848F.svg" alt="Electron 43" />
    <img src="https://img.shields.io/badge/Node-%3E%3D18-339933.svg" alt="Node >= 18" />
    <img src="https://img.shields.io/badge/platform-Windows-lightgrey.svg" alt="Platform: Windows" />
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" />
  </p>
</div>

> **「简介」是最大的优势** —— 不捆绑运行时、不引入框架、不魔改上游，
> 只做窗口、托盘、快捷键与安全隔离，其余交给系统里的 `dsh web`。

---

## 目录

- [简介](#简介)
- [特性](#特性)
- [与其他 DSH 桌面壳的对比](#与其他-dsh-桌面壳的对比)
- [为什么选择本项目](#为什么选择本项目)
- [快速开始](#快速开始)
- [配置](#配置)
- [项目结构](#项目结构)
- [架构](#架构)
- [安全](#安全)
- [已知限制](#已知限制)
- [常见问题](#常见问题)
- [贡献](#贡献)
- [开源协议](#开源协议)

## 简介

DeepSeek Harness Desktop 是一个基于 Electron 的轻量桌面壳，采用 **Native-First** 架构：

- 主进程仅依赖 Node.js 内置模块 + 1 个轻量托盘封装（`electron-menubar`），**零第三方框架**；
- 前端纯原生 HTML/CSS/JS，**不引入任何框架**；
- 不捆绑 DeepSeek 本体，直接调用系统已安装的 `dsh web` CLI 拉起本地 Web 服务，
  再用 BrowserWindow 嵌入展示。

你只需在系统中安装 Node.js 和 DeepSeek Harness CLI，桌面壳负责窗口管理、托盘、
快捷键和安全隔离。升级 `dsh` 即升级能力，桌面壳保持「薄」且「透明」。

## 特性

- 🚀 调用系统 `dsh web` 启动本地 Web 服务，BrowserWindow 嵌入展示；
  启动失败（dsh 未安装）则弹窗提示并退出
- 🪟 Windows 下 Acrylic 亚克力背景 + 透明 `titleBarOverlay`；
  macOS 下 `hiddenInset` 红绿灯 + sidebar 毛玻璃效果
- 🎨 悬浮标题栏拖拽：纯 DOM 事件 → `setBounds` 显式钉住宽高，
  规避 Electron `setPosition` 篡改尺寸的核心 bug，4px 阈值防误触，交互控件零遮挡
- 📋 类原生托盘：自绘无边框透明圆角菜单 + 悬浮高亮 + 智能定位
  （菜单在鼠标右上角弹出）；左键单击显隐主窗口，右键打开菜单
- ⌨️ 全局快捷键显示/隐藏主窗口，默认 `Ctrl+Shift+Space`，设置页支持实时录制
- 🔋 开机自启（打包后生效），静默启动时只出托盘不弹窗口
- ⚙️ 设置页纯原生实现提供：
  - **环境** — Node.js / npm / dsh 版本检测与一键更新，安装 dshmarket 插件市场
  - **常规** — 快捷键录制器 + 开机自启 Switch + 乐观更新 + Toast 提示
- 🔒 安全加固：`contextIsolation` + `sandbox` + 权限拒绝 + 导航限制 +
  外部链接用浏览器打开 + 弹窗 deny
- 🧹 退出时进程树终止（Windows 下 `taskkill /t`），单实例锁防多开，
  第二实例自动唤起主窗口；关闭主窗口时隐藏到托盘而非退出
- 🔄 托盘菜单支持应用重启，重启前清理 UI 和子进程

## 预览

![1787643103745](image/README/1787643103745.png)

## 与其他 DSH 桌面壳的对比

详见 [docs/COMPARISON.md](docs/COMPARISON.md) —— 包含三项目对比表格，以及
dsh-desktop（anywhere-labs）与 deepseek-harness-desktop（Tauri 版）两个参考项目的
详细优劣势分析。

## 快速开始

### 环境安装

本桌面壳依赖 Node.js 与 DeepSeek Harness CLI，首次使用请按以下步骤安装：

#### 1. 安装 Node.js

访问 [Node.js 官网](https://nodejs.org/) 下载 **LTS 版本（>= 18）** 安装包：

- **Windows**：下载 `.msi` 安装包，双击运行，勾选「Add to PATH」→ 一路 Next 即可

#### 2. 安装 DeepSeek Harness CLI

```bash
npm install -g deepseek-harness

dsh --version   # 安装完成后验证：应正常输出版本号
```

> 如果 `dsh` 命令不可用，请检查 npm 全局 bin 目录是否在系统 PATH 中。
> Windows 下通常为 `%APPDATA%\npm`，macOS/Linux 下通常为 `/usr/local/bin`。

### 插件市场（dshmarket）

桌面壳「设置 → 环境」页提供一键安装 **dshmarket** 插件市场：
`dsh --profile web plugin add dshmarket`。它用于在 DSH Web 内浏览、搜索并
一键安装社区插件。

## 配置

用户偏好持久化到 `config.json`（开发：项目根目录；打包：`$DSH_HOME/storages/deepseek-harness-desktop/`）：

## 项目结构

```
DeepSeek Harness/
├── main.js                  # 入口（单实例锁 + app 事件 + 启动调度）
├── settings.html            # 设置页（内联 CSS/JS，环境 / 常规 / 日志 / 关于）
├── src/
│   ├── autostart.js         # 开机自启管理
│   ├── constants.js         # 常量与纯工具函数
│   ├── dsh-home.js          # dsh 规范 home 路径解析（~/.dsh）
│   ├── env.js               # 运行时模式 + 环境检测与更新
│   ├── host.js              # dsh web 子进程管理（spawn / 就绪 / 终止）
│   ├── ipc.js               # IPC 处理器（设置 / 日志 / 拖拽 / 窗口控制）
│   ├── lifecycle.js         # 应用生命周期（bootstrap / 退出 / 重启）
│   ├── state.js             # 全局状态 + 日志基础设施 + 进程守卫
│   ├── store.js             # 配置存储（config.json）
│   ├── tray.js              # 托盘 + 托盘菜单（electron-menubar 封装）
│   └── windows.js           # 窗口管理（创建 / 导航 / 显示切换）
├── preload/
│   ├── preload-tray.js      # 托盘菜单 preload
│   ├── preload-main.js      # 主窗口 preload（拖拽 API）
│   └── preload-settings.js  # 设置页 preload
├── assets/
│   ├── app.ico
│   ├── favicon.ico
│   └── favicon.svg
└── package.json
```

## 架构

```
┌──────────────────────────────────────────────┐
│  main.js（入口）                              │
│   单实例锁 → app 事件 → bootstrap 调度        │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│  主进程（src/）                               │
│  lifecycle  ·  windows  ·  tray  ·  ipc      │
│  host（dsh web 子进程） ·  store ·  env      │
│  state（日志 + 进程守卫）                     │
└───────┬───────────────────────────┬──────────┘
        │ BrowserWindow              │ spawn
┌───────▼──────────┐      ┌──────────▼──────────┐
│ 主窗口（dsh Web）│      │  dsh web CLI        │
│  preload-main    │      │  → 127.0.0.1:3080   │
│  + 拖拽注入脚本   │      │  DSH_HOME=~/.dsh   │
└──────────────────┘      └─────────────────────┘
```

- **主进程**：纯 Node 内置模块 + Electron API，模块职责单一（见项目结构）。
- **渲染进程**：主窗口加载 dsh Web；设置页为纯原生页面，通过 preload 暴露的最小
  IPC 面与主进程通信（`contextIsolation` + `sandbox`）。
- **数据流**：`dsh web` 子进程 → 本地 HTTP 服务 → BrowserWindow 内嵌展示；
  主进程只做窗口、托盘、快捷键与生命周期管理。

## 安全

- 所有窗口开启 `contextIsolation` + `sandbox`，渲染进程无 Node 权限
- preload 仅暴露白名单通道，拒绝未知 IPC
- 导航限制：禁止外部 URL 加载进应用窗口，外部链接一律交给系统浏览器
- 弹窗（`window.open`）一律 deny
- 托盘菜单 preload 最小权限（仅 `tray-menu-select`）

## 已知限制

- **需要预装环境** — 需系统已安装 Node.js（>= 18）与 dsh CLI，不提供「下载即用」的捆绑运行时；
- **自更新为手动** — 不内置自动更新，需在设置页「环境」标签手动更新 dsh；
- **平台支持** — 构建配置目前仅 Windows（NSIS + Portable）；代码含 macOS 适配分支
  （hiddenInset / 毛玻璃），但尚未配置 macOS 打包，暂无 Linux 版本；
- **运行时依赖** — 存在 1 个第三方运行时依赖（`electron-menubar`，托盘封装）；
- **上游兼容** — 跟随系统 `dsh` 版本，上游破坏性变更可能影响桌面壳（与 Tauri 版一致）。

## 常见问题

**Q：启动提示「dsh 未安装」？**
A：请先安装 [Node.js](https://nodejs.org/)（>= 18）与 DeepSeek Harness CLI，
并确保 `dsh` 在系统 PATH 中可用。

**Q：与 dsh-desktop / Tauri 版有什么区别？**
A：见[对比章节](#与其他-dsh-桌面壳的对比)。本项目的定位是「简介」——
约 3.5k 行代码、零框架、易修改，桌面体验（窗口铺满、自定义标题栏、快捷键、
类原生托盘）完整；对比结论基于对三个项目源码的完整阅读。

**Q：日志文件在哪里？**
A：开发模式在项目根目录 `logs/host.log`；打包后位于 `$DSH_HOME/logs/deepseek-harness-desktop/`。
设置页「日志」标签可查看、清空或打开所在目录。

## 贡献

欢迎提交 Issue 与 PR！

- 代码风格：主进程仅使用 Node 内置模块，前端纯原生，不引入框架
- 提交前请确保 `node --check` 通过全部 JS 文件
- 涉及重命名时请全局搜索调用点，避免遗漏

## 开源协议

基于 [MIT License](./LICENSE) 开源。

「DeepSeek Harness」为深度求索公司的商标，本文仅用于准确说明兼容性与技术来源。
本项目为独立社区项目，与深度求索不存在隶属、合作、授权或背书关系。
