# Windows 适配维护说明

当前适配：Antigravity **App 2.26.0 / 2.33.0 / Windows x64**。macOS 支持版本见主分支说明。使用方法见 [README.md](README.md)，调研依据与初始方案见 [WINDOWS-ADAPTATION-PLAN.md](WINDOWS-ADAPTATION-PLAN.md)。

## 平台边界

| 位置 | 职责 |
| --- | --- |
| `src/installer.js` | 按运行平台分派安装器 |
| `src/installers/macos.js` | 原 Mac 安装、签名、备份、健康确认和还原流程 |
| `src/installers/windows.js` | Windows 身份检查、独立状态、全量备份、事务与启动确认 |
| `src/platform/windows.js` | 安装发现、PE/fuses、官方分发校验、进程检测、ACL/属性和复制 |
| `src/adapters.js`、`data/adapter-*.json` | 精确匹配平台、架构、版本；Mac 原指纹未变 |
| `src/patch.js` | 共用 AST 打补丁与 ASAR 校验，Windows 传入自己的适配器和健康记录位置 |
| `src/runtime.js`、`src/native.cjs` | 共用受限 DOM 翻译与原生菜单显示翻译 |
| `src/transaction.js` | 资源替换日志与恢复；Windows 保留原资源权限 |
| `scripts/windows.cmd`、根目录中文 `.cmd` | 中文入口、Node/依赖检查，不更改执行策略 |

Windows 官方安装包本身 Google LLC 签名有效，安装后的主程序和语言服务原厂未签名。适配文件包含官方 URL、安装包指纹、分发文件 SHA-256（2.26.0 为 425 个文件，2.33.0 为 454 个文件）和可选卸载器指纹，不包含原厂二进制。所有哈希均由核验过的官方包提取，不能用未知本地文件直接更新基线。

## 本地验证

使用 Node.js 24.15 及以上的 24.x 版本：

```powershell
npm ci --ignore-scripts
npm test
node src/cli.js check
```

`npm test` 在临时副本运行安装与还原，不写正在使用的 Antigravity。原始资源发现顺序为环境变量 `AG_ZH_ORIGINAL_ASAR`、本地 `work/official-2.33/app/resources/app.asar` / `work/official/app/resources/app.asar`、默认原版安装；Mac 另支持原来的原版备份位置。显式提供的资源必须匹配适配指纹。

覆盖范围包括：翻译区域与用户内容隔离、原生命令 ID/回调/快捷键、WSL 发行版名保护、ASAR 未修改文件、未知版本、Windows 长路径/中文/空格/引号、DACL/属性、真实文件锁、只读目标、junction 拒绝、非法事务路径、重复安装、完整恢复、中断恢复与升级冲突。另一平台特有检查会明确跳过；Windows 测试通过不能替代新一轮 Mac 实机验收。

Windows 状态放在 `%LOCALAPPDATA%\Antigravity zh-CN\instances\<安装路径标识>\`，含 `current.json`、`health.json`、`backups` 和 `transactions`。原版备份按版本和指纹隔离。健康确认匹配安装 UUID、进程、版本、资源路径与翻译计数。

安装和恢复要求正常退出应用。启动失败且进程仍在运行时，保留事务并提示退出后恢复；不强制终止用户工作。恢复前核对当前原版/补丁资源及全部其他文件，拒绝旧备份覆盖已升级或未知的安装。写入只涉及 `resources/app.asar` 和补丁标记。

## 继续适配新版本

1. 取得对应平台官方分发，检查来源、签名、产品、架构、版本、PE/Electron 保护配置与资源布局。
2. 新增独立适配数据，不覆盖旧平台或旧版本基线。核对 AST 修改点和精确数量，不使用宽泛替换。
3. 在副本打包，逐文件验证字节、unpacked、link、executable 等元数据；不得修改 fuses 或可执行文件绕过保护。
4. 核对本地前端的真实界面标记，维持输入、正文、代码、路径、模型名和用户命名保护。
5. 完成自动测试，再安装到真实应用进行首页、设置、模型、原生菜单、快捷键、草稿保护及还原验收，并记录边界。

官方升级顺序仍为“恢复原版 → 官方升级 → 检查新版本 → 重新汉化”。`work/`、测试资源、安装器、应用副本、备份和本机收据不得提交。
