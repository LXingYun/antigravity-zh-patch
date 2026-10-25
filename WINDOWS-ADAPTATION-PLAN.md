# 本机 Antigravity Windows 适配调研与方案

调查日期：2026-10-25（Asia/Shanghai）。仓库起点：`c52d453`，`main`，初始工作区干净。

**结论：可以沿用现有翻译引擎与资源补丁路线，新增 Windows x64 / Antigravity App 2.26.0 适配。当前代码不能直接安装；必须先处理来源基线、平台路径、事务恢复和新版界面验证。** 保留现有 macOS arm64 / 2.25.0 适配。本轮只调查并形成方案，没有修改补丁源码或已安装应用，没有启动、关闭或重启 Antigravity。

## 1. 已确认的本机环境

| 项目 | 实测结果 |
| --- | --- |
| 安装位置 | `C:\Users\Crazy\AppData\Local\Programs\antigravity` |
| 产品 | Antigravity App；ASAR 包名 `antigravity`，入口 `dist/main.js` |
| 版本 | EXE FileVersion、卸载登记和 ASAR package.json 均为 `2.26.0` |
| 架构 | EXE 的 PE Machine 为 `0x8664`，即 x64；当前 Node 也是 win32/x64 |
| Electron | 安装目录 `version` 文件为 `44.4.3`，尚未通过运行时读取复核 |
| 主资源 | `resources/app.asar`，4,387,714 字节；旁边存在 `app.asar.unpacked` |
| 界面服务 | `resources/bin/language_server.exe`，177,882,624 字节 |
| 其他服务 | `resources/bin/webm_encoder.exe` |
| 安装目录大小 | 426 个文件，共 594,692,831 字节，约 567 MiB；未发现 reparse point |
| 当前运行状态 | 调查时有 6 个 Antigravity.exe 进程和 1 个该安装目录下的 language_server.exe 进程 |
| 已知补丁痕迹 | 未发现 `ag-zh-patch.json`、`resources/app`、`app.asar.disabled`、`app.asar.bak`；不能据此排除其他未知修改 |
| 本机开发环境 | Node.js `24.19.0`、libuv `1.52.1`、npm `12.0.2`，满足仓库 Node 版本要求 |

本机路径和文件内容是上述事实的直接来源。官方也分别提供 App 2.26.0 和 IDE 2.5.5，不能使用 IDE 的语言包方案替代本 App 适配。[官方产品下载页](https://www.antigravity.google/download)

本轮采集的 SHA-256 **仅是本机观察值，不是已经验证的官方白名单**：

| 文件 | SHA-256 |
| --- | --- |
| `Antigravity.exe` | `59a9cc2a05d36671a5610f129b1962e04a34ce5ee27be992dd9b6db83f753316` |
| `resources/app.asar` | `8ce27ff7c2defa10ed1ed2817288a61c546690f4cae1b1a8c91d4e69e0851e4d` |
| `resources/bin/language_server.exe` | `4575b7fa20280b87b527e5d6075648126b8a11e39d78fe70c4d29df2c1466ca5` |

## 2. 来源和完整性机制

`Get-AuthenticodeSignature` 对主程序和语言服务均返回 `NotSigned`。主程序 PE Security Directory 的证书偏移和长度也均为 0，佐证其没有嵌入式证书。版本字符串与 ASAR 内作者为 Google 的声明不能替代来源验证。因此当前只能称其为“本机安装”，不能显示“Google 原厂完整签名有效”。

已从官方下载页定位 [2.26.0 Windows x64 安装包](https://storage.googleapis.com/antigravity-public/antigravity-hub/2.26.0-6546645232517120/windows-x64/Antigravity-x64.exe)。后台研究只做 HEAD 请求，确认对象存在，大小为 166,335,944 字节；本轮没有下载、执行或解包该安装器，也没有核对其签名。后续先从此官方渠道下载，在临时目录静态提取，记录安装器 SHA-256 与签名实际结果，再比对主程序、ASAR、语言服务和其他不应改变的分发文件。若官方包内同样未签名，则分别记录“匹配官方渠道下载基线”和“未签名”。来源不符时停止安装，不直接接受当前本机哈希。

只读解析本机 `Antigravity.exe` 得到 fuse wire：版本 1、9 个状态、`101100011`。按 [Electron 官方枚举](https://github.com/electron/fuses/blob/main/src/config.ts)，索引 4 的 `EnableEmbeddedAsarIntegrityValidation` 和索引 5 的 `OnlyLoadAppFromAsar` 均为关闭状态。该结果说明当前没有这一道 ASAR 强制头部校验障碍，支持继续验证纯资源替换；它不证明补丁启动成功或来源可信。

Windows 支持将 ASAR 预期头部哈希嵌入 EXE。若后续版本开启该校验，重新打包归档不能自行解决 EXE 内的预期哈希差异，现有纯资源路线应拒绝该版本。[Electron ASAR 完整性文档](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)

## 3. 代码兼容性实查

现有补丁通过 AST 定点修改 7 个 Electron 模块，在 preload 中注入受来源限制的 DOM 翻译器，原生菜单另外翻译显示文字。词库有 1109 条。实际窗口来源常量仍为 `https://127.0.0.1`，`createWindow` 保留 preload、`contextIsolation: true` 与 `nodeIntegration: false`，没有现成 `additionalArguments` 属性冲突。来源：本机 ASAR 的 `dist/constants.js`、`dist/utils.js` 与仓库 [patch.js](src/patch.js)。

以下仅按现有 AST 匹配规则扫描并计数，没有改写或重新打包目标应用：

| 模块 | 与旧适配指纹比较 | 当前匹配点数 / 旧预期 | 判断 |
| --- | --- | --- | --- |
| `preload` | 不同 | 1 / 1 | 可保留追加注入思路，须保留新版原 API |
| `menu` | 不同 | 4 / 4 | 原动作查找修正仍适用，需补 Windows/WSL 行为测试 |
| `tray` | 相同 | 3 / 3 | 旧函数在内存中接受该模块，需验证 Windows 托盘行为 |
| `updater` | 相同 | 4 / 4 | 旧函数在内存中接受该模块，更新动作标识继续保留 |
| `utils` | 不同 | 1 / 1 | origin 参数注入位置仍存在 |
| `main` | 不同 | 6 / 6 | 健康记录路径必须改；Dock 代码只在 Mac 分支使用 |
| `ipcHandlers` | 不同 | 3 / 3 | 原文件夹弹窗规则仍匹配；另有原生右键菜单入口 |

5 个变化模块都被现有指纹检查正确拒绝。匹配点数量相同只证明静态结构仍可定位，不证明新旧语义、DOM 覆盖或启动行为完全一致。

| 已确认的问题 | 代码位置与影响 | 适配处理 |
| --- | --- | --- |
| 只允许 macOS arm64 | `src/installer.js:20`，路径、plist、签名工具均绑定 macOS | 增加独立 win32/x64 平台实现与版本选择 |
| 清单路径不统一 | `src/platform.js:51` 用 `path.join` 生成反斜杠键；`:73` 及 installer 写死正斜杠键 | 清单键统一为 `/`，实际磁盘路径单独处理；资源允许改动项由目标布局提供 |
| ASAR 内路径也有同类问题 | 本机 `asar.listPackage()` 返回 `\\dist\\...`；`src/patch.js:103` 只去首字符，无法匹配适配表的 `dist/...` | ASAR 条目规范化后再查指纹和允许修改集；加真实 Windows 打包验证 |
| 健康记录路径绑定 Mac | `src/patch.js:78` 和 `src/installer.js:10` | 两端共用同一状态目录规则，不能只改安装器 |
| 签名语义绑定 Mac | `src/platform.js` 的 codesign、ditto；installer 的成功文案 | 分离来源比对、Authenticode、补丁哈希状态；如实显示 NotSigned |
| 进程检查/启动绑定 Mac | `/bin/ps`、`/usr/bin/open` | 使用 Windows 进程可执行路径与父子关系；覆盖当前实例语言服务，不按名字误杀其他实例 |
| 权限清单不适用于 Windows | 当前只记录 POSIX mode | 明确 DACL、只读属性、reparse point 的处理；实测备份与替换后的权限 |
| Windows 特有菜单 | 本机 `dist/menu.js` 的 WSL 子菜单；`dist/ipcHandlers.js` 的 `buildContextMenuTemplate` | 固定命令按 id/已验证上下文翻译；WSL 发行版名及用户标签原样保留 |
| 版本/备份记录绑定单个适配 | `recipeHash()` 固定旧适配文件；单个 `current.json` | 将产品、平台、架构、版本、安装位置和资源指纹纳入身份及记录 |
| 前端验证尚不完整 | 旧表的 `frontendSha256` 没有被安装器实际使用 | 明确字段语义；核对真实 2.26.0 静态资源/DOM，不能凭此字段宣称已验证 |

本机原生右键菜单由 renderer 传入 `item.label`、`item.id`、子菜单等再构建，不能对整个菜单无差别递归翻译。WSL 子菜单的 `d.name` 同样可能是用户命名。应补“用户名称恰好为 Settings/New Project 仍不改变”的用例。

官方 2.26.0 更新涉及通知设置、输入框上方提问/审批区、会话筛选排序、插件配置等，应优先检查这些区域的固定文案与用户内容隔离。[官方版本说明](https://www.antigravity.google/docs/changelog?tab=hub)

## 4. 本轮验证与边界

| 检查 | 结果 |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | 成功；只准备本地依赖，未改 package-lock.json |
| `npm run test:runtime` | 12/12 通过；jsdom 的词条、节点/事件保留、输入及名称保护、来源隔离与增量行为通过 |
| `node --test test/transaction.test.js` | 2/8 通过，6 项失败；错误直接指向清单路径分隔符和相应键读取 |
| 指定本机目录执行 `check` | 被“仅支持 Apple Silicon macOS”拒绝；没有写入应用 |
| ASAR 模块/PE/fuses 检查 | 只读完成，结果见上文 |

事务测试中的通过项也不能当 Windows 安全验收：部分断言只要求操作被拒绝，可能被路径错误提前满足。修正后应断言具体拒绝原因、实际残留文件和恢复结果。

没有执行依赖 Mac 应用的完整 `npm test`；没有运行补丁后的真实应用、修改应用数据、调用模型或执行升级。语言服务二进制中的直接字符串搜索未能确认大多数 DOM 标记；这不证明标记已删除，压缩或打包形式均可能影响搜索。真实 DOM、前端完整指纹、WSL 远端服务、文件占用和 ACL 行为仍待后续验证。

## 5. 推荐实施方案

保留 `check / status / install / restore` 四个用户命令。翻译规则与安装流程继续共享，平台差异集中在应用发现、身份检查、文件清单、备份、替换及启动接口。首个 Windows 支持目标限定为本次核对的 App 2.26.0 x64、本地语言服务模式；Windows ARM64 和 WSL 模式的实际翻译覆盖另行验证。

| 阶段 | 工作与交付 | 进入下一阶段的条件 |
| --- | --- | --- |
| P0 来源与只读识别 | 下载并静态提取官方同版本安装包；逐项比对；新增候选 `adapter-2.26.0-win32-x64.json`，记录 EXE/服务/归档/7 模块、fuses、来源依据；实现 Windows `check` | 可识别本机产品，签名状态如实显示；未知版本、来源差异、异常 fuse、路径异常有明确报告且拒绝安装 |
| P1 平台与恢复基础 | 增加 `src/platform/windows.js` 和对应 Mac 实现，保留 `src/platform.js` 作为公共入口；统一清单路径；适配备份、日志、资源允许改动项和 Windows 文件替换；按安装实例分开状态 | 临时目录中的正常安装/恢复、每一步中断、锁占用、权限失败、损坏备份及升级冲突均通过；未占用真实应用 |
| P2 离线补丁构建 | `patch.js` 显式接收已选适配；修复 ASAR 路径规范化；适配健康路径；在副本打包并验证只改允许的 7 模块及新增补丁文件，保持 unpacked 布局和内容 | 新归档语法和内部完整性正确；所有其他分发文件逐字节一致；未知模块或匹配点异常会失败 |
| P3 Windows 行为与文案 | 新建窗口、托盘、原生右键/文件夹菜单、Ctrl 快捷键和 WSL 名称保护；按真实 2.26.0 DOM 补文案与精确选择器 | 正文、路径、草稿、模型名、项目名、WSL 名称、技能描述、代码和终端均不误翻译；菜单原动作/id/快捷键保持有效 |
| P4 本机安装验收 | 应用正常退出后复验，完成完整备份再换资源；启动与健康确认；执行恢复、重装及重复安装验收；交付中文 Windows 入口和记录 | 启动、中文 UI、恢复哈希、无未完成事务均实测通过；文档清楚区分自动测试与真实 UI 检查 |

P0/P1 可作为首个实现批次；P2/P3 在安装副本上完成；P4 才触碰本机安装。实现与安装属于后续工作，本轮不执行。

### Windows 数据与事务约定

- 默认探测 `%LOCALAPPDATA%\Programs\antigravity`，再读取卸载注册表；保留 `--app` 手动指定。多个候选要明确选择，不根据名称随意选中另一个产品。
- 状态放在 `%LOCALAPPDATA%\Antigravity zh-CN`，不写入 App 的账号/会话目录。备份至少绑定 `产品 + 平台 + 架构 + 版本 + 原始 ASAR 指纹`，事务还绑定规范化后的实际安装路径。
- 完整备份与暂存应用各约 567 MiB，另需安装器、提取目录和日志空间。开始前按实际文件量计算空间，不能只按 4.2 MiB ASAR 估算。
- 仅替换 `resources/app.asar`，增加补丁标记；保留 EXE、DLL、服务二进制与 unpacked 依赖。重打包产生的 unpacked 副本只用于核对；若其内容不同，应视为不兼容，而非顺带覆盖。
- 临时归档放在目标资源目录同卷，记录日志、刷新文件，再执行替换。Windows 锁失败时保留可恢复状态；不能先删除原文件再复制，也不安排重启后替换。
- 先验证实际 Node/libuv rename 的行为与 DACL 保留。只有现有方案无法满足目标文件权限/属性要求时，再引入封装的 Windows 替换实现；`ReplaceFileW` 本身也需处理部分失败状态。详见 [官方依据报告](docs/research/windows-official-sources-2026-10-25.md)。
- 恢复以实际归档哈希、前后清单、标记、日志共同判断。对于应用升级、未知第三方更改、损坏备份或权限不足，拒绝覆盖并报告原因。
- 正常退出检查应覆盖主程序、子进程和相关语言服务。启动失败恢复仅操作此次安装启动且身份可核实的实例；无法确认或无法退出则保留事务待正常退出后恢复。
- 健康记录两端使用同一路径规则，并绑定当前版本、安装路径、进程及本次安装/启动标识，保留翻译计数；不记录页面或账号内容。健康确认只证明引擎已执行，不能代替 UI 验收。

### 验收标准

1. **兼容性：**新旧适配按平台、架构、版本和文件基线分别选择；不能通过删平台限制或仅改版本号安装。原 macOS 适配数据保持不变，macOS 集成验收只能在 Mac 上声明完成。
2. **文件与恢复：**完整备份可核对；每个事务写入间隙的中断都能恢复或明确拒绝；重复安装不叠加；升级后不会用旧备份覆盖新文件；Windows 只读/锁占用和中文空格路径有实测。
3. **行为：**首页、设置、新版通知/审批/会话筛选、模型/项目选择、插件/MCP、托盘、右键菜单、目录选择、新窗口与 Ctrl 快捷键工作正常。测试不发送真实模型请求、创建自动化或触发真实更新。
4. **内容保护：**以 `Settings`、`New Project` 等同名草稿、项目、WSL 名称及固定正文验证不误改；输入值、链接目标、命令 id、模型值、路径不变化。
5. **交付：**增加中文 `.cmd` 入口调用 Node，避免要求全局放宽 PowerShell 执行策略；README/Windows 说明记录精确支持版本、签名实况、备份路径和恢复命令。升级流程继续为“恢复 → 官方升级 → 新版本核查 → 再安装”。

## 6. 当前尚未完成的证据

最重要的三项是：**官方安装包与本机文件的一致性、真实 2.26.0 DOM 的覆盖与保护、Windows 文件占用/恢复及补丁启动实测**。上述方案具备实施依据，但这些证据补齐之前不能把 Windows 版标为已适配或可直接安装。

本轮仓库交付仅为本方案与 [官方依据报告](docs/research/windows-official-sources-2026-10-25.md)，以及被 git 忽略的本地依赖目录；没有提交 git，也没有上传原厂资源、备份或用户数据。
