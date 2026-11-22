# Windows 适配验证记录

日期：2026-10-25（2.26.0），更新：2026-11-22（2.34.0）。本记录针对 Antigravity **App 2.26.0 / 2.33.0 / 2.34.0 / Windows x64**，不代表 IDE、Windows arm64 或未列出的后续版本可用。

## 环境与来源

- 安装目录：`%LOCALAPPDATA%\Programs\antigravity`。
- Node.js 24.19.0，npm 12.0.2，Electron 44.4.3。
- [Google 官方安装包](https://storage.googleapis.com/antigravity-public/antigravity-hub/2.26.0-6546645232517120/windows-x64/Antigravity-x64.exe)的 Authenticode 状态为 Valid，签署者 Google LLC。
- 安装包 SHA-256：`2444dfef9ff280b3c418399ff259c66684c98886bece26290484cf80c33756c9`。
- 从该包提取的 425 个分发文件与本机逐项一致，另核对官方卸载器。主程序和语言服务原厂状态为 NotSigned；未将未签名描述为签名有效。
- 原始 ASAR SHA-256：`8ce27ff7c2defa10ed1ed2817288a61c546690f4cae1b1a8c91d4e69e0851e4d`。
- 主程序 SHA-256：`59a9cc2a05d36671a5610f129b1962e04a34ce5ee27be992dd9b6db83f753316`。
- 语言服务 SHA-256：`4575b7fa20280b87b527e5d6075648126b8a11e39d78fe70c4d29df2c1466ca5`。
- fuse schema 为 version 1、count 9、values `101100011`，未修改；ASAR 强制校验原厂未启用。

官方安装器仅提取和核验，没有运行安装器覆盖用户应用。原厂二进制和静态前端仅保存在忽略的 `work/`，未入库。2.26.0 前端含翻译器引用的全部 38 个 `data-testid` 标记；这一静态检查不等同于所有页面已实机验收。

## 自动测试

最终完整测试命令为 `npm test`：**36 项，35 通过，0 失败，1 跳过**，耗时约 135 秒。跳过项为需要 macOS 的未知版本 Info.plist 检查。

| 范围 | 结果 |
| --- | --- |
| 翻译区域、来源隔离、增量更新、用户输入/正文/路径/模型名保护 | 通过 |
| 真实 2.26.0 原生模块：菜单、托盘计数、更新回调、快捷键、文件夹取消、右键命令 ID | 通过 |
| WSL 发行版名和动态右键标签不翻译 | 通过 |
| 官方 ASAR 打包、未修改文件、unpacked/executable 元数据 | 通过 |
| 未知平台、架构、版本、PE/fuse schema 拒绝 | 通过 |
| 中文、空格、引号及超过 260 字符的路径 | 通过 |
| DACL/属性保留、不同父目录权限继承、junction 和非法事务路径拒绝 | 通过 |
| 真实 Windows 文件锁、只读目标、资源替换中断恢复 | 通过 |
| 完整副本安装、重复安装、恢复、current.json 写入后中断恢复 | 通过 |
| 未知额外文件、升级后的资源和损坏备份拒绝覆盖 | 通过 |

修复了三个 Windows 差异：ASAR 库的路径分隔符、Windows 打包丢失 executable 元数据、Windows PowerShell 长路径与继承权限行为。首次本机安装在备份权限校验阶段停止，未改应用资源；补充最小回归测试后修复，再重跑完整测试。

备份容器是新建且为空的私有暂存目录，其继承边界按原安装父目录设置；不改变原安装 ACL。比较保留所有 ACE、权限、SID、继承和保护标志，只归一化无权限含义的 AI 记录位及全允许 ACL 中不影响访问结果的顺序；带拒绝项的 ACL 不排序。相关继承行为参见 [Microsoft Set-Acl 文档](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/set-acl?view=powershell-5.1)。

## 本机验收

完成顺序：测试通过 → 正常退出应用 → 完整备份并安装 → 启动确认与界面检查 → 重复安装检查 → 正常退出并恢复 → 重新安装并再次确认中文界面就绪。最终保留一个中文应用窗口运行，待恢复事务为空。

| 实际操作 | 观察结果 |
| --- | --- |
| 首页、侧栏和顶部菜单 | 中文显示正常，页面布局可用 |
| 常规设置 | 固定标题、说明、选项显示为中文，仅查看，未改变权限 |
| 通知设置 | 标题、开关说明、音量说明显示中文，未改变开关 |
| 模型与用量、模型选择菜单 | 固定界面文字中文，模型名称保留；未更换模型或套餐 |
| 输入 `Settings New Project C:\test\中文 Gemini 4 Argon` | 草稿逐字保留；撤销后输入框为空，未发送消息 |
| Ctrl+Shift+N | 成功创建第二窗口，自动显示中文；验收后关闭第二窗口 |
| 创建项目入口 | 固定菜单中文，原生选择框标题为“打开工作区” |
| 取消文件夹选择 | 返回首页，未创建项目 |
| 对已安装补丁再次执行 install | 不重复注入，归档哈希不变 |
| 实际 restore | 全部文件和权限清单匹配备份，原始 ASAR 哈希恢复一致；主程序和语言服务哈希不变；无待恢复事务 |

完整原版备份位于 `%LOCALAPPDATA%\Antigravity zh-CN\instances\35becd24a8ad2d15cb6d5529\backups\win32-x64-2.26.0-8ce27ff7c2defa10\`。运行健康确认匹配对应安装 UUID、版本、进程和资源路径，首次主窗口回报 32 次翻译；该数字不是总词库覆盖率。

## 保留的 Mac 支持与边界

原 Mac 安装器搬到 `src/installers/macos.js`，已与原提交逐行比较，除导入相对路径外相同；旧适配数据、`.command` 入口、状态/备份目录及签名检查均保留。共享模块仍使用原 Mac 默认适配，Windows 显式传入自身适配器。本次没有 Mac 设备，不能宣称重新完成 Mac 实机验收；原历史记录保留在 [验证记录.md](验证记录.md)。

未进行真实模型请求、项目修改、插件安装、自动化创建、系统通知触发、托盘交互或官方更新下载；这些不能由本次 UI 验收推断为已测。原生菜单更新回调及托盘逻辑有自动测试覆盖。服务端公告、`Dismiss`、`Give Feedback` 等少量新文案仍可能为英文；未扩大到用户内容区域做无差别翻译。

后续升级顺序：恢复原版 → 官方升级 → 确认对应版本已有独立适配 → 再安装。未知版本不会自动套用本补丁。

## 2.33.0 适配更新验证（2026-11-19）

本轮针对已升级的 **Antigravity App 2.33.0 / Windows x64** 新增独立适配 `data/adapter-2.33.0-win32-x64.json`，同时完整保留 macOS arm64 2.25.0 与 Windows x64 2.26.0 基线。

### 环境与官方来源

- 安装目录：`%LOCALAPPDATA%\Programs\antigravity`。
- Node.js `24.19.0`，Electron `44.9.1`。
- [Google 官方安装包](https://storage.googleapis.com/antigravity-public/antigravity-hub/2.33.0-4731201358004224/windows-x64/Antigravity-x64.exe)的 Authenticode 状态为 `Valid`，签署者 `Google LLC`，SHA-256 为 `44aea1c00f3b347fd60ab7291d267dbb04a5080f6c3212a8a31cf1426ddf86cb`（与官方更新清单 `latest-x64-win.yml` 的 SHA-512 一致）。
- 静态提取的 454 个核心分发文件及可选 `Uninstall Antigravity.exe`（SHA-256 `e6444d8ef27e5abbeead467392709bf5da9dc2fd87c693b36d838824cda8e19a`）与本机安装目录逐项一致。
- 主程序 `Antigravity.exe`（SHA-256 `cfc4f8fdabbf5da7ab498ec0078fbb5aa123f30bb2da347a415c1a74f67449ef`）与语言服务 `resources/bin/language_server.exe`（SHA-256 `eb6d986dfc5a859c6e9b1b36a0601f5c362993cc16eb8962ad554c9141defc9c`）原厂状态仍为 `NotSigned`。
- 原始 ASAR SHA-256：`b33c81600e82e65593aa8430ef01b37d6b28d9d98f0faf45e25957783b71e64b`。
- fuse schema 仍为 version 1、count 9、values `101100011`，ASAR 完整性强制校验原厂未启用。

### 架构与词库变更

- **多版本适配器调度**：`src/adapters.js` 与 `src/installers/windows.js` 依据目标目录版本号动态匹配适配器，隔离计算各自 `recipeHash`、安装身份与事务校验。
- **窗口与健康确认兼容**：2.33.0 默认采用 `BaseWindow` + `WebContentsView` (`hubWcv`) 与共享 `additionalArguments`。`src/patch.js` 改在共享变量点注入 `--ag-zh-origin` 并完整保留 `--agy-backend=ssh` 等参数；`main.js` 健康确认改用 `utils_1.isLocalHubTopFrame(event)` 识别本地顶帧。
- **菜单与弹窗**：`dist/menu.js` 增强 `View` 菜单查找幂等性；`src/native.cjs` 扩充 `pin`、`mark-read`、`fork`、`restore`、`open-in-*` 等固定命令 ID/标签白名单；`dist/ipcHandlers.js` 覆盖新增的 `Select Download Folder`（“选择下载文件夹”）。
- **DOM 隔离与词库**：`src/runtime.js` 补齐 2.33.0 设置侧栏导航白名单及 `Projects`/`Workspaces` 下同名项目防误翻，并将对话消息、Git 分支、SSH 主机、下载文件名/路径、自动化指令 Markdown、语音设备/音色等纳入硬保护；`data/zh-CN.json` 新增 225 条词条，总计 1336 条。

### 自动测试与只读校验

- `npm test`：**38 项测试，37 通过，0 失败，1 跳过**（总耗时约 200 秒，跳过项为需 macOS 的未知版本 `Info.plist` 检查），涵盖 2.33.0 官方副本重打包、原生模块 VM 行为、受限 DOM 与隔离规则，以及在隔离副本中完成的备份/安装/重复安装/篡改拒绝/中断恢复/还原全流程。
- 只读 `node src/cli.js check`：退出码 0，核实本机 2.33.0 安装匹配 Google 签名安装器基线，待处理事务为空。
- **初次适配阶段**：当时会话运行在 Antigravity 2.33.0 实例内，仅完成上述自动测试与只读检查；后续本机安装及补漏验收见下节。

### 首页与语音补漏、实机重装（2026-11-19）

- 在 1336 条词库基础上补充 52 条，总计 **1388 条**；补齐首页三组轮换欢迎语、侧栏分页与操作、界面布局说明、语音设置与音色弹窗、字体/颜色选择、浏览器设置和快捷键属性。欢迎语保留用户名，音色/麦克风名称与快捷键组合保留原值。
- `npm run test:runtime`：**17/17 通过**。新增回归覆盖动态文本更新、真实音色及设备名称保护、系统默认占位、受保护正文、侧栏计数和快捷键标签；补充检查 `Ctrl+P` 文件搜索与 `Ctrl+U` 自动化的标签。
- 正常关闭应用后执行 `restore` → `install`，恢复与重装均退出码 0；安装结果为 `installed: true`、`recipeCurrent: true`、`pending: []`，启动就绪确认匹配 2.33.0 及本次安装标识。
- 实机确认：首页欢迎语和“查看全部（8）”显示中文；常规页的界面布局、远程权限说明、语音模式、未设置、系统默认、音量说明均已翻译；音色弹窗标题、描述、切换按钮、序号与“使用 Fola”显示正常，音色名保留英文。仅查看并关闭音色弹窗，没有保存音色或修改其他设置。
- 实机核对快捷键页：命令面板、关闭/重新打开标签页及文件搜索、自动化的操作属性已中文，组合键保持原值；浏览器页的“更改…”和“浏览历史记录”已中文，下载目录保持原值。
- 继续使用原版完整备份：`%LOCALAPPDATA%\Antigravity zh-CN\instances\35becd24a8ad2d15cb6d5529\backups\win32-x64-2.33.0-b33c81600e82e655\`。

## 合入 main 后的双平台验证（2026-11-20）

共享词库共 1514 条。Windows 2.33.0 和 macOS 2.33.0 使用相同的原厂 ASAR，各平台分别校验自己的应用文件。两端的本地主窗口都保留原厂启动参数，SSH 窗口保留独立的预加载行为。

| 测试环境 | 测试通过 | 按平台或版本跳过 | 失败 |
| --- | ---: | ---: | ---: |
| Windows x64，Antigravity 2.33.0 | 49 | 2 | 0 |
| Windows x64，Antigravity 2.26.0 | 47 | 4 | 0 |
| macOS arm64，Antigravity 2.33.0 | 45 | 6 | 0 |

Windows Server 2022 运行器分别下载并校验两个版本的官方安装包，在解包后的目录执行 `检查兼容性.cmd`。安装器在各自的离线副本上完成备份、安装、重复安装、异常资源拒绝、中断恢复和还原。上文单列了人工界面验收。[Windows 自动测试日志](https://github.com/LXingYun/antigravity-zh-patch/actions/runs/44574868393)

Apple Silicon Mac 在全新检出目录安装锁定依赖后运行测试。另用 7 个受支持 Mac 版本的原始归档分别验证重打包和适用于该版本的原生菜单测试。本机运行 `检查兼容性.command` 成功识别已安装汉化的 2.33.0。

## 2.34.0 适配更新验证（2026-11-22）

新增独立适配 `data/adapter-2.34.0-win32-x64.json`，保留 Windows x64 2.26.0 / 2.33.0 与 macOS arm64 2.25.0。

### 官方来源与资源结构

- 从[官方下载页](https://antigravity.google/download)取得 [2.34.0 Windows x64 安装包](https://storage.googleapis.com/antigravity-public/antigravity-hub/2.34.0-5887025308631040/windows-x64/Antigravity-x64.exe)，仅静态提取，没有运行安装器。
- 安装包 Authenticode 为 `Valid`，签署者为 `Google LLC`，SHA-256 为 `7c34f5aecbb269a182b12f63fd8f4f7e3bb4a893f23490d99735b137a7e881bd`。
- 提取的 **454 个分发文件**及可选官方卸载器与本机安装逐项一致；主程序和语言服务原厂均为 `NotSigned`。
- 原始 ASAR SHA-256：`8934adef0622c9271c92eea950a71848764a66f7b10023ccbd82e54b959adb0e`。
- Electron 仍为 `44.9.1`，fuse schema 为 version 1、count 9、values `101100011`；ASAR 完整性强制校验未启用。
- 七个待改模块均重新核对指纹和 AST 注入点，修改数量与 2.33.0 相同；无需修改主程序、fuses 或共用补丁算法。

### 新版翻译与内容隔离

- 对照本机 2.34.0 实际静态前端与[官方更新日志](https://antigravity.google/docs/changelog?tab=hub)，新增 **96 条**词条，词库共 **1484 条**。覆盖输入框发送快捷键及说明、编排器/执行模型设置、思考强度说明、自定义侧栏与筛选、插件筛选和连接状态等固定文案。
- 仅放行已核实的思考强度标题和侧栏定制区域；新增插件显示菜单及拖动预览中的名称保护。侧栏第 1–9 项快捷键只翻译固定操作名，保留组合键、配置值、模型名、项目名和草稿。
- 自动测试覆盖 2.34.0 新增区域的中文显示、用户内容保护及动态属性；旧版受限翻译规则继续保留。

### 自动验证

- 共 **44 项**用例：最终 **43 通过、1 跳过**，跳过项需 macOS。首次全量执行的唯一失败来自原生窗口测试桩缺少 2.34.0 新用到的 `contentView.on`；补齐该真实 Electron 接口后，原生模块 **7/7** 定向复测通过。
- 全量中的 Windows 完整副本流程通过：备份、构建、安装、重复安装、未知资源拒绝、升级冲突拒绝、中断恢复和完整还原；ASAR 未修改文件及 executable/unpacked 元数据校验通过。
- 使用 `AG_ZH_ORIGINAL_ASAR` 指向 2.33.0 官方归档补测，原生模块与归档重打包 **8/8** 通过。
- 本机只读兼容性检查通过；`git diff --check` 通过。

### 本机安装与界面验收

- 用户确认退出后安装成功；实机补齐“置顶对话”“置顶操作”“排队消息”三条漏译后，正常退出、恢复原版并重装最终版本。恢复和安装均退出码 0，最终 `installed: true`、`recipeCurrent: true`、`pending: []`，启动确认匹配 2.34.0 及本次安装标识。
- 最后补漏涉及的 DOM 与原生模块定向复测 **26/26** 通过。完整副本安装与恢复证据沿用前述同版本流程，最终本机重装再次完成资源校验。
- 已实机核对首页欢迎语、置顶对话标题、侧栏分页、常规设置的输入框/发送快捷键/排队消息与语音设置，中文正常且布局可用。
- 已打开模型菜单及思考强度子菜单，固定标题与说明中文，模型名称保留。交互测试曾临时选择 Carbon Medium，随后恢复原先的 `Gemini 4 Neon Extra High`，未发送消息。
- Ctrl+Shift+N 新窗口自动显示中文；输入 `Settings Input Box C:\test\中文 Gemini 4 Neon` 后逐字保留，撤销后输入框为空，未发送消息；验收用的第二窗口已关闭。
- 原版完整备份：`%LOCALAPPDATA%\Antigravity zh-CN\instances\35becd24a8ad2d15cb6d5529\backups\win32-x64-2.34.0-8934adef0622c927\`。

自定义侧栏与插件可见性菜单的隔离有自动测试覆盖；本机当前未展示的新侧栏实验入口、第三方 MCP App 内部页面与未触发的错误状态未做实机验收。
