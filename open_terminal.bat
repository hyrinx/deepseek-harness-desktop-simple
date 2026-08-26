@echo off
REM 加载历史命令（按↑浏览）
if exist "D:\代码\DeepSeekHarness\deepseek-harness-desktop-simple\cmd_history.txt" (  for /f "usebackq delims=" %%i in ("D:\代码\DeepSeekHarness\deepseek-harness-desktop-simple\cmd_history.txt") do (    doskey /insert "%%i" 2>nul  ))
echo ══════════════════════════════════════
echo   常用命令
echo ══════════════════════════════════════
echo.
echo   dsh plugin --profile web add ^<name^>      安装插件
echo   dsh plugin --profile web remove ^<name^>   删除插件
echo   dsh plugin --profile web list              查看插件列表
echo   npm install -g @deepseek-ai/dsh@latest     更新 dsh
echo.
echo  提示：输入 savehist 保存历史，按↑浏览历史命令
echo.
doskey savehist=doskey /history ^> "D:\代码\DeepSeekHarness\deepseek-harness-desktop-simple\cmd_history.txt"
cmd /k