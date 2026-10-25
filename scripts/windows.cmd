@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0.." || exit /b 1
where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js。请先安装 Node.js 24.15 及以上的 24.x 版本。
  pause
  popd
  exit /b 1
)
if not exist "node_modules\@electron\asar\package.json" (
  echo 缺少依赖。请在本目录运行 npm ci --ignore-scripts 后重试。
  pause
  popd
  exit /b 1
)
node src/cli.js %*
set "result=%errorlevel%"
pause
popd
exit /b %result%
