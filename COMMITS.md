# COMMITS

## 2026-08-26 22:40:00

chore: 便携版产物去除文件名版本号

- [package.json](../package.json) 的 `portable` 目标新增 `artifactName: "${productName}.${ext}"`，文件名由 `DeepSeek Harness Desktop Simple 1.4.0.exe` 改为 `DeepSeek Harness Desktop Simple.exe`
- 开机自启经 `realExePath()` 取 `PORTABLE_EXECUTABLE_FILE` 真实文件名，与版本号无关，去除版本号不影响该逻辑
- 发布流程按 GitHub 真实资产名生成下载表，文件名变化自动适配，无需改动

## 2026-08-26 22:30:00

fix: 修复开机自启全链路(写入删除纯 Electron API + 显式 name 删除 + 失败兜底 + 测试)

### 根因
- `app.getLoginItemSettings()` 读回不可靠：Windows 上读回 `openAtLogin` 恒为 false——既要求传入的 `path`/`args` 与 `setLoginItemSettings` 完全一致，又存在「路径含空格读回失效」的 Electron 缺陷（#31710，官方不修复），无法作为真实自启状态的判定依据
- `app.setAppUserModelId` 会改变 `setLoginItemSettings` 写入注册表的默认键名，读写键名不一致进一步加剧读回 false
- 关闭开机自启失效：Windows 上 `app.setLoginItemSettings({ openAtLogin: false })` 只有显式传入 `name` 才会删除对应的 Run 注册表值，不传 `name` 时删除静默失效、条目残留 → 表现为「点击关闭后重启仍自启」

### 修复(src/autostart.js)
- `loginOptions()` 统一 `name: app.name + path + args`，读写共用同一份参数：开启写入与关闭删除指向同一值名，关闭可正确删除 Run 值
- 写入/删除改用纯 Electron API `app.setLoginItemSettings`；便携版经 `realExePath()` 传真实双击路径，避免默认写入 %TEMP% 临时目录
- 读取仍用 `reg query` 整键校验真实状态（唯一能反映实际自启的手段，因纯 API 读回不可靠）
- 失败兜底：`actuallySet` 与请求不一致时强制清除自启项，避免注册表残留「表面开启实则无效」条目，消除 UI 与实际状态不符
- 移除调试用的 `autostart.apply` 诊断日志，文件头注释精简为必要信息

### 配套
- `src/constants.js`：自启参数 `--from-autostart` → `--silence`
- `src/settings-overlay/settings-overlay.js`：`commit` 改乐观更新，用 `actuallySet` 检测底层静默失败并提示
- 新增 `tests/autostart-pure-api.test.js`：验证纯 Electron API 下开启/关闭对注册表的真实写入与删除（退出码 0 全过）；关闭必须显式传 `name`，省略会静默失效

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