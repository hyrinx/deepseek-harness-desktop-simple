# COMMITS

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