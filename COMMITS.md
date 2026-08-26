# COMMITS

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