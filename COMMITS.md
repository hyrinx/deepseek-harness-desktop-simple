# COMMITS

## 2026-08-26 22:30:00

chore: 清理 autostart.js 调试日志，精简说明

- 移除 [src/autostart.js](../src/autostart.js) `applyAutoStart` 中诊断用的 `autostart.apply` 日志（完整打印 `getLoginItemSettings` 对照注册表），该调试目的已完成
- 精简文件头注释为必要信息：写入/删除走纯 Electron API，读取因 Electron「路径含空格读回恒 false」（#31710 官方不修复）故用 `reg query` 校验，便携版传真实双击路径
- 保留失败兜底逻辑与失败日志，语法校验通过

## 2026-08-26 22:10:00

test: 新增开机自启纯 Electron API 测试(验证无需直接操作注册表)

- 新增 [tests/autostart-pure-api.test.js](../tests/autostart-pure-api.test.js)，用隔离值名 + 外部 path 验证 `app.setLoginItemSettings` 的开启/删除：注册表仅作为断言事实源，生产逻辑不直接改注册表
- 测试结论(5 项全过)：纯 Electron API 可完成自启写入与删除；但关闭时**必须显式传 `name`**，省略 name 会静默失效（阶段 3 已复现）；`getLoginItemSettings` 读回在非默认 execPath 下恒为 false，不可作为判定依据
- 运行：`node_modules\.bin\electron.cmd tests\autostart-pure-api.test.js`，退出码 0 全过

## 2026-08-26 21:55:00

fix: 修复关闭开机自启失效（Electron 删除 Run 值需显式传 name）

- 根因：Windows 上 `app.setLoginItemSettings({ openAtLogin: false })` 只有显式传入 `name` 时才会删除对应的 Run 注册表值；不传 `name` 时删除会静默失效，注册表条目残留，表现为「点击关闭后重启仍自启」。用隔离的 Electron 测试脚本实证复现并定位：开启时不传 name 正常写入 `app.name`（如 `dukestest`），关闭时不传 name 条目仍在，显式传 `name` 后条目被删除
- 修复：[src/autostart.js](../src/autostart.js) 的 `loginOptions()` 在 Windows 分支显式补 `name: app.name`，使开启写入与关闭删除统一指向同一值名（真实值名即 `deepseek-harness-desktop-simple`）；`path` 仍用真实双击路径、`args` 仍用 `--silence`
- 读取仍以 `reg query` 整键验证为准（`getLoginItemSettings` 在本环境读回 `openAtLogin` 恒为 false，不可靠）

## 2026-08-26 20:35:00

fix: 开机自启改用纯 Electron API(移除 reg query,修复读回 openAtLogin 为 false)

- 根因：`app.getLoginItemSettings()` 在 Windows 上要求传入的 `path`/`args` 与 `setLoginItemSettings()` 完全一致，否则 `openAtLogin` 恒为 `false`——之前安装版/便携版读回 false 正是读写比对参数不一致导致，而非注册表写入失败
- 修复：[src/autostart.js](../src/autostart.js) 新增 `loginOptions()`，读写共用同一份 `{ path: realExePath() || process.execPath, args: ['--silence'] }`；删除 `execSync` / `reg query`，不再直查注册表
- 便携版经 `realExePath()` 传真实双击路径，避免 Electron 默认用临时解压目录路径比对失败；macOS 不传参（`path`/`args` 仅 Windows 有效，móu平台行为保持不变）

## 2026-08-26 19:30:00

fix: 修复开机自启开启失败的问题

- 根因 1：`app.setAppUserModelId` 会改变 `setLoginItemSettings` 写入注册表的默认键名，但 `getLoginItemSettings` 仍用 `app.name` 读取，导致读写键名不一致，`openAtLogin` 始终为 `false`
- 根因 2：`setLoginItemSettings` 显式传入 `path: app.getPath('exe')` 后，`getLoginItemSettings` 内部用 `process.execPath` 与注册表值做比对，Windows 上路径大小写/短路径等边缘情况会导致字符串不相等，比对失败
- 修复底层：[src/autostart.js](../src/autostart.js) 两处——`setLoginItemSettings` 和 `getLoginItemSettings` 均显式传入 `name: app.name`，确保读写同一键名；删除 `path` 参数，让 Electron 默认使用 `process.execPath`，读写使用同一默认值
- 修复 UI：[src/settings-overlay/settings-overlay.js](../src/settings-overlay/settings-overlay.js) `commit` 改为乐观更新，用 `res.actuallySet !== nextEnabled` 检测底层是否静默失败
- 自启参数 `AUTOSTART_ARG` 由 `--from-autostart` 改为 `--silence`（[src/constants.js](../src/constants.js)）

## 2026-08-26 19:06:10

fix: 安装包下载表改用 Release 真实资产名生成(修复空格转点号导致 404)

- 根因：原实现基于本地文件名用 `name// /%20` 拼接下载 URL，而 GitHub 托管资产时会把文件名中的空格自动转为点号，导致安装包下载链接 404
- 修复：[release.yml](../.github/workflows/release.yml) 分两步——先以草稿发布资产，再用 `gh release view "<tag>" --json assets` 读取 GitHub 真实托管的 `browser_download_url` 生成下载表，最后 `gh release edit` 合并更新内容与下载表
- 划分步骤：生成发布说明(更新内容) → 发布到 GitHub Release(草稿) → 生成安装包下载表(按真实资产) → 更新发布正文

## 2026-08-26 16:30:00

fix: 修复 release.yml 第 102 行 YAML 语法错误

- 根因：组装分类正文的 `emit()` 函数内使用了跨多行的双引号字符串（`NOTES+="\n...`），触发 GitHub 工作流 YAML 解析错误
- 修复：改用临时文件（`mktemp`）追加生成分类正文，避免跨行引号

## 2026-08-26 16:15:00

fix: workflow_dispatch 时 release 检出 main 导致变更记录为空

- 根因：release job 默认 checkout 在 `workflow_dispatch` 下取到 main 分支，`git describe HEAD^` 解析出的 PREV 与目标 TAG 相同，对比区间塌缩为空，分类变更记录因此缺失
- 修复：[release.yml](../.github/workflows/release.yml) 的 release job checkout 显式指定 `ref: inputs.tag_name || github.ref`，确保检出目标 tag

## 2026-08-26 16:00:00

feat: 发布正文改为按 conventional commit 分类生成(同 Ghost-Downloader-3)

- 原实现用 `gh api generate-notes` 生成扁平 "What's Changed" 列表,无功能/优化/修复分类
- 改为基于 `git log` 按提交前缀归类到 `✨ 新增` / `🔧 优化` / `🐛 修复` / `📋 其他` 四个分类区块,空分类自动跳过
- 恢复对上一版本 tag(`PREV`)的解析,作为对比区间

## 2026-08-26 15:50:00

fix: 发布正文中 Full Changelog 链接重复

- 根因：`gh api generate-notes` 生成的 NOTES 末尾已自带 `**Full Changelog**: v1.3.0...v1.4.0` 链接，发布脚本又用 `COMPARE` 手动追加了一遍相同内容，导致重复
- 修复：[release.yml](../.github/workflows/release.yml) 移除手动加 `COMPARE` 的逻辑（连同失效的 `PREV` 变量），仅保留 generate-notes 自带链接

## 2026-08-26 15:40:00

fix: auto-tag 调度 Release 工作流 403，缺少 actions:write 权限

- 根因：`gh workflow run` 需要 `actions: write` 权限，`auto-tag` job 仅声明 `contents: write`，导致触发发布工作流时返回 HTTP 403 "Resource not accessible by integration"
- 修复：[build.yml](../.github/workflows/build.yml) 的 auto-tag job 增加 `actions: write` 权限

## 2026-08-26 15:25:00

fix: 修复 tag 推送不触发 Release 工作流的问题

- 根因：GitHub 规定用 `GITHUB_TOKEN` 产生的推送不触发新的 tag 工作流，`auto-tag` 推送 v1.4.0 后 `release.yml` 不会自动运行
- 修复：[build.yml](../.github/workflows/build.yml) 的 auto-tag 在推完 tag 后用 `gh workflow run "Release"` 显式调度发布工作流（workflow_dispatch 允许 GITHUB_TOKEN 触发）

## 2026-08-26 15:14:51

feat: 发布自动化（自动打 tag + 自动生成发布正文）

- `.github/workflows/build.yml`：新增 auto-tag job，push 到 main/master 时自动创建并推送 `vX.Y.Z` tag 以触发发布，版本未变化时跳过
- `.github/workflows/release.yml`：发布正文全自动生成——checkout 加 `fetch-depth: 0` 取完整历史，移除对手写 release-template.md 的依赖，改为自动生成安装包下载表、GitHub 更新记录及 Full Changelog 对比链接
- `package.json`：版本号 1.3.0 → 1.4.0

chore: 清理废弃文件并同步文档引用

- 删除 `release-template.md`（发布正文已自动生成，模板冗余）
- 删除 `src/preload/preload-settings.js`（旧独立设置窗口 preload，设置 API 已迁移至 `preload-main.js`）
- `package.json` build.files、README.md、AGENTS.md、main.js、preload-main.js 中移除对已删除文件的引用
- AGENTS.md 新增规范第 9 条（每项改动生成 COMMITS.md），删除「版本文档维护」章节，修正 `src/settings-overlay/` 路径