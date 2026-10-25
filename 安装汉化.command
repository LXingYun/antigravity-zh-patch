#!/bin/zsh
set -u
cd -- "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '找不到 Node.js。请先安装 Node.js 24，再重试。'
  read '?按回车关闭…'
  exit 1
fi
node src/cli.js install
result=$?
read '?按回车关闭…'
exit "$result"
