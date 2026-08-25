# 与其他 DSH 桌面壳的对比

DSH 生态中已有多个桌面壳项目。下表从**桌面体验**与**工程复杂度**两个角度，
对比本项目与两个主流开源实现：

| 维度       | **本项目（Electron）**                                    | [dsh-desktop](https://github.com/anywhere-labs/dsh-desktop)（anywhere-labs） | [deepseek-harness-desktop](https://github.com/dsh-tauri-desk/deepseek-harness-desktop)（Tauri） |
| ---------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 技术栈     | Electron 43 + 原生 HTML/CSS/JS                                  | Electron 43 + React 18 + Cordis                                             | Tauri 2（Rust）+ React 19                                                                      |
| 代码规模   | \~3.5k 行（11 JS + 1 HTML）                                     | \~33k 行（monorepo，159 文件）                                              | 73 Rust + 53 前端文件                                                                          |
| 运行时依赖 | 1 个（electron-menubar）                                        | 大量（React / Vite / Cordis 等）                                            | 26 Cargo + 17 npm                                                                              |
| 运行时策略 | 复用系统 Node.js +`dsh web` CLI                               | 固定版本 Harness（submodule）                                               | 首次启动下载 Node + Harness 内核                                                               |
| 环境依赖   | 需预装 Node.js + dsh CLI                                        | 零依赖，下载即用                                                            | 下载即用（首次需联网装配）                                                                     |
| 窗口体验   | 自定义悬浮标题栏（titleBarOverlay）+ Acrylic，壁纸铺满无黑边    | 自定义窗口框架（titleBarOverlay + Mica）                                    | 无边框窗口，自绘标题栏，与内容割裂，iframe 加载                                                |
| 全局快捷键 | ✅ 默认`Ctrl+Shift+Space`，可录制                             | ❌ 无                                                                       | ❌ 无                                                                                          |
| 系统托盘   | ✅ 类原生，介于两者之间：圆角、悬浮高亮、智能定位，交互贴近原生 | ⚠️ Electron 原生菜单，样式与系统原生不一致，观感一般                      | ✅ Rust 原生 Tray+Menu 符合系统原生，观感最佳；但菜单仅 2 项                                   |
| 插件生态   | 可选安装dshmark插件市场，实现便捷安装插件体验                   | 一切皆插件 + 内置社区市场                                                   | 插件管理面板 + 预设引导                                                                        |
| 自更新     | ❌ 手动更新                                                     | ✅ 自定义自更新                                                             | ✅ 自定义自更新                                                                                |
| 跨平台     | Windows（代码含 macOS 分支）                                    | Windows / macOS                                                             | Windows / macOS / Linux                                                                        |
| 修改成本   | 低（零框架、代码量小）                                          | 高（monorepo + Cordis）                                                     | 中（Rust + React）                                                                             |

> 注：以上对比基于对三个项目**源码的完整阅读**（本地克隆逐文件核实）及实际使用体验。两个参考项目均为优秀的社区项目，各自侧重不同：dsh-desktop 主打「一切皆插件」的生态与开箱即用，Tauri 版主打「多平台、自更新、档案隔离」。

## 参考项目

> 注：以下测试环境均在全局 dsh 下进行，预先已安装常用插件，壁纸采用 wallpaper-engine 插件。

### dsh-desktop（anywhere-labs）

![1787642279438](../image/README/1787642279438.png)

优势：

- 插件生态成熟：一切皆插件（Cordis），桌面壳本身也是插件，内置社区市场
- 开箱即用：下载即用，无需预装 Node.js
- 自更新：自定义版本检查 + 下载安装流程
- 窗口能力丰富：Windows `titleBarOverlay` + Mica，macOS `hiddenInset` + 毛玻璃
- 托盘菜单项丰富（打开桌面 / profiles / 状态 / 模式切换 / 退出）
- 无法复用全局dsh的插件

劣势：

- 代码复杂：monorepo + Cordis + React，约 33k 行，修改成本高
- 无全局快捷键（仅窗口内 Zoom 快捷键）
- 托盘为 Electron 原生菜单，样式与系统原生不一致，且功能过于复杂
- 深度绑定上游：固定版本 Harness（submodule）+ 大量 `@deepseek-ai/dsh-*` 依赖
- 应用图标与托盘图标不一致

> 本项目灵感来源于其 v1.0.0 版本，但细节方面存在不足，且 v2.0.0 版本太过臃肿，
> 窗口和托盘不够简洁美观，因此产生了此项目，以实现更轻便的 DSH 桌面版本。

### deepseek-harness-desktop（Tauri 版）

![1787640851492](../image/README/1787640851492.png)

优势：

- 多平台：Windows / macOS / Linux 全平台产物
- 自更新：自定义自更新（GitHub Release）
- 档案隔离：多档案隔离，插件 / 补丁 / 设置互不干扰
- 本地环境复用：检测到系统已有兼容 Node / Pnpm 时优先复用
- CLI 集成：自动注册 `dsh` 命令 shim
- 托盘：Rust 原生，macOS 模板图标贴近系统原生

劣势：

- 首次启动需下载 Node 运行时 + Harness 内核，安装速度缓慢；卸载残留会导致
  DSH 无法启动，需手动删除本地连接插件
- 无全局快捷键（未注册 `tauri-plugin-global-shortcut`）
- 无边框窗口（`decorations(false)`），自绘标题栏与内容区域割裂，且 Harness Web UI
  通过 `<iframe>` 加载，壁纸四周出现黑边，视觉上不完整
- 托盘菜单仅「打开面板 / 退出」两项，缺少丰富交互

> 本项目尝试过 Tauri 架构，也遇到上述问题，如悬浮标题栏无法拖动的同时穿透底部可交互控件，
> wallpaper-engine 壁纸出现黑色区域。

## 为什么选择本项目

![1787642455590](../image/README/1787642455590.png)

1. **简介（核心优势）** — Native-First 架构，主进程只用 Node 内置模块 + 1 个轻量
   托盘封装，前端纯原生，零框架。整个壳约 3.5k 行代码，结构清晰，
   **易于阅读、修改与审计**。
2. **完整窗口体验** — 自定义悬浮标题栏（Windows `titleBarOverlay` + Acrylic，
   macOS 红绿灯 + 毛玻璃），Harness 壁纸**铺满整个窗口（无黑边）**。
3. **全局快捷键** — 全局显示/隐藏主窗口，默认 `Ctrl+Shift+Space`，设置页实时录制。
4. **类原生托盘** — 自绘无边框透明圆角托盘菜单，左键显隐、右键菜单，交互贴近原生。
5. **安全加固** — `contextIsolation` + `sandbox` + 权限拒绝 + 导航限制，默认最小权限。
6. **透明可控** — 不捆绑、不魔改上游，完全复用系统 `dsh`，升级 `dsh` 即升级能力。