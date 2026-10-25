# 第三方来源

词库参考并整理自以下 MIT 项目，运行时、安装事务和版本适配逻辑在本项目重新实现。

- [Sj295/antigravity-chinese-plugin](https://github.com/Sj295/antigravity-chinese-plugin)，审阅版本 `64a2211bb9dd60be18c685f4ee687c264dfeb9bb`，来源 `src/injector.js`。许可证全文见 `licenses/Sj295-MIT.txt`。
- [MIMICTE/Antigravity-zh-CN](https://github.com/MIMICTE/Antigravity-zh-CN)，审阅版本 `fd59274d939fbe3592c9c00344eceeff1cc84e31`，来源 `Antigravity-Patcher.py` 中的词库。许可证全文见 `licenses/MIMICTE-MIT.txt`。

本项目没有执行这两个项目的安装脚本，没有沿用其强制结束进程、宽泛子串替换或整块 innerHTML 替换逻辑。

Node.js 依赖由 npm 安装，精确版本记录于 package-lock.json；各依赖许可证随 node_modules 分发。Antigravity、Electron 及 Google 商标归原权利人所有。本目录不分发原厂应用或账户数据。
