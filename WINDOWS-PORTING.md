# Windows 适配续接

当前交付是 **Antigravity App 2.25.0 / macOS arm64** 的已验证补丁，不是 Windows 成品。不要删除平台检查后直接对 Windows 应用运行安装。Windows 版本号、架构、文件布局和资源指纹必须在目标机器重新采集。

## 开发起点

先用有仓库访问权限的 GitHub 账号克隆，安装 Node.js 24.15 及以上的 24.x 版本。在 PowerShell 中运行：

```powershell
git clone https://github.com/LXingYun/antigravity-zh-patch.git
Set-Location antigravity-zh-patch
npm ci --ignore-scripts
npm run test:runtime
git switch -c windows-port
```

`test:runtime` 运行 jsdom 中的翻译行为测试，不读取 Antigravity，也不会安装补丁。完整 `npm test` 中的原生模块和归档测试会读取 Mac 上的原版应用或备份；兼容性测试依赖 macOS。其余文件事务测试也不能代替 Windows 文件锁和权限的实机验收。

本仓库固定 JS、JSON 等文本为 LF，防止 Windows 换行转换改变补丁源码指纹。修改后正常提交源码；原厂应用、解包资源、账号和本机备份均不应入库。

## 代码入口

| 文件 | 当前职责 | Windows 适配工作 |
| --- | --- | --- |
| `data/zh-CN.json` | 1109 条界面词条 | 沿用词库，按目标版本新增文案 |
| `src/runtime.js` | 来源校验、限定区域的增量翻译 | 确认新版本来源、DOM 结构和选择器，保留用户内容保护 |
| `src/native.cjs` | 原生菜单显示文本与命令标识分离 | 验证 Windows 菜单、托盘和快捷键行为 |
| `src/patch.js` | AST 修改、原生模块指纹检查与 ASAR 打包 | 拆分平台/版本适配选择，重新核对修改点；当前健康记录路径仍写死为 macOS |
| `data/adapter-2.25.0.json` | macOS 2.25.0 的已验证指纹 | 保留此文件，新增 Windows 专用适配数据；同版本不同平台不得共用指纹 |
| `src/platform.js` | macOS 签名、进程、复制和文件清单 | 实现 Windows 版本/签名验证、进程检测、复制及权限保留 |
| `src/installer.js` | 检查、备份、安装、状态、还原 | 适配安装目录、用户状态目录、可执行文件、健康确认与启动流程 |
| `src/transaction.js` | 资源替换与中断回滚 | 验证 Windows 重命名、占用文件、权限和故障恢复语义 |
| `test/` | 运行时、原生动作、归档、版本与事务验证 | 分离便携测试和平台集成测试；原厂测试资源只从本机读取 |

## 实施顺序

1. 检查目标机器的 Antigravity App 版本、架构、安装目录、官方签名和 Electron 保护配置，采集原始 ASAR 及相关模块/界面服务指纹。不要把原厂二进制提交到仓库。
2. 为平台和版本建立独立适配入口。保留 macOS 已验证路径；未知版本、其他补丁及不一致的文件必须拒绝写入。
3. 在临时副本完成 AST 定点修改、语法检查、ASAR 打包和完整性验证。确认全部未修改文件逐字节一致，不通过关闭系统保护或修改可执行文件绕过校验。
4. 实现 Windows 的完整备份、退出后再次校验、资源替换、事务记录和失败还原。确认应用退出，不强制结束用户任务；备份按版本和指纹区分且不覆盖。
5. 适配启动和健康记录路径，再制作中文 PowerShell 或双击入口。安装前、恢复前均核对版本与指纹，避免旧备份覆盖升级后的资源。
6. 在 Windows 实机验证主界面、模型选择、设置、快捷键、原生菜单、托盘和更新状态；用 `Settings`、`New Project` 等用户输入确认不被误翻译。测试重复安装、写入失败、文件占用、中断恢复与升级冲突。

官方更新流程仍为“恢复原版 → 官方升级 → 检查新版本 → 重新汉化”。macOS 验证记录只证明已记录的 Mac 环境，不代表 Windows 可用。

## 给 Windows 上的编程助手

> 请基于本仓库适配这台 Windows 机器上已安装的 Antigravity App。先阅读 README.md、WINDOWS-PORTING.md 和现有源码，确认版本、架构、原厂签名及文件结构；保留 macOS 2.25.0 的适配。先完成只读检查、Windows 适配代码和测试，再安装验证。不要跳过版本/指纹检查，不要上传应用二进制、备份或账号数据；保留用户输入、对话正文、代码、路径、模型名和项目名。沿用完整备份、退出后复验、事务回滚和升级冲突保护，记录实际测试范围。
