# AGENTS.md

## 项目概述

DeepSeek Harness Desktop Simple — 基于 Electron 的轻量桌面壳，Native-First 架构，零第三方框架。

- **主进程**: Node.js 内置模块 + `electron-menubar`
- **前端**: 纯原生 HTML/CSS/JS
- **运行时**: 调用系统 `dsh web` CLI，BrowserWindow 嵌入展示

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 43 |
| 主进程 | Node.js (CommonJS) |
| 渲染进程 | 原生 HTML/CSS/JS（零框架） |
| 打包 | electron-builder (NSIS + Portable) |
| 平台 | Windows (x64) |

## 项目结构

```
├── main.js              # 入口（单实例锁 + app 事件 + 启动调度）
├── settings.html        # 设置页面（单文件内联）
├── package.json         # 项目配置 + electron-builder 配置
├── config.json          # 运行时配置（开发模式）
├── assets/              # 图标等静态资源
├── preload/
│   ├── preload-main.js     # 主窗口 preload
│   ├── preload-settings.js # 设置窗口 preload
│   └── preload-tray.js     # 托盘 preload
├── src/
│   ├── constants.js     # 常量 + 路径函数 + 注入脚本
│   ├── state.js         # 全局状态 + 日志基础设施 + 进程守卫
│   ├── store.js         # 配置存储（JSON 文件）
│   ├── env.js           # 运行时模式 + 环境检测 + 插件安装
│   ├── dsh-home.js      # DSH 路径解析
│   ├── host.js          # dsh 子进程管理
│   ├── windows.js       # 主窗口 + 设置窗口
│   ├── tray.js          # 托盘 + 托盘菜单
│   ├── autostart.js     # 开机自启
│   ├── ipc.js           # IPC 处理器 + 全局快捷键 + 窗口拖拽
│   └── lifecycle.js     # 生命周期管理
└── dist/                # 构建输出
```

## 模块职责

### src/env.js
- 运行时模式检测（dev / installer / portable）
- Node.js / npm / dsh 版本检测
- npm / dsh 更新
- dshmarket 插件安装与版本检测
- IPC 通道注册：`env:check-node`, `env:check-npm`, `env:check-dsh`, `env:check-plugin`, `env:update-npm`, `env:update-dsh`, `env:update-plugin`

### src/host.js
- dsh 子进程 spawn（`dsh web --host 127.0.0.1 --port 0 --no-open`）
- 就绪检测（逐行解析 stdout 中的就绪 URL）
- 进程树终止（Windows: taskkill /t /f）
- 子进程退出后的自动退出处理

### src/ipc.js
- 设置相关：`settings:get`, `settings:set-shortcut`, `settings:get-autostart`, `settings:set-autostart`
- 应用信息：`get-platform`, `get-version`
- 日志相关：`logs:get-info`, `logs:open-folder`, `logs:open-file`, `logs:tail`, `logs:clear`
- 环境检测：委托 `env.js` 的 `registerEnvHandlers`
- 设置向导：`setup:mark-done`
- 窗口拖拽：通过 `window-drag-start/move/end` 事件实现

### src/lifecycle.js
- 启动入口 `bootstrap()`：创建主窗口 → 启动 host → 创建托盘 → 导航
- 首次启动：自动弹出设置窗口，引导用户检查系统环境
- 退出/重启：`destroyUI` + `shutdownHost` + `app.quit/relaunch`

## 代码规范

1. **不要删除注释**，除非注释已过时
2. 修改注释时保持中文注释风格
3. 使用 `require` (CommonJS)，不使用 ES Module
4. 主进程和 preload 使用 Node.js，渲染进程使用原生 DOM API
5. 日志统一使用 `logEvent()` 函数
6. 配置存储使用 `store.get/set` 方法
7. IPC 通信使用 `ipcMain.handle` + `ipcRenderer.invoke` 模式
8. preload 通过 `contextBridge.exposeInMainWorld` 暴露 API

## 安全注意事项

- 所有 IPC 通道名须与注册的 handle 一致
- 快捷键键名使用白名单 `SHORTCUT_KEYS` 防止越权写入
- 窗口拖拽使用 `setBounds` 而非 `setPosition`（避免 Electron Windows 下 DPI 缩放 bug）
- 窗口权限检查：`setPermissionCheckHandler(() => false)` 禁止所有权限请求
- 插件安装命令使用 `windowsHide: true` 隐藏命令行窗口