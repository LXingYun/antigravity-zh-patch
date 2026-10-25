# Windows 适配：官方依据与约束

调查日期：2026-10-25（Asia/Shanghai）。本文件仅为调研记录；没有安装补丁、修改应用、下载完整安装包或验证修改后启动。

## 结论

应以 **Antigravity App 2.26.0 / Windows 的本机实测指纹**新增适配，保留现有 macOS 2.25.0 适配。官方发布渠道确实提供 App 2.26.0 Windows 安装包，但公开版本号和本机文件名不能证明已安装文件来自该安装包。Windows 资源替换的可行性仍取决于本机 Electron fuses、完整性资源、原始文件基线与文件占用实测。

## 产品与版本：已核实

- 官方下载页分别列出 **Antigravity App 2.26.0** 与 **Antigravity IDE 2.5.5**，两者具有不同下载项；因此不得将 IDE 的 VS Code 扩展目录、语言包机制或版本号套用到 App。[官方产品下载页](https://www.antigravity.google/download)
- 官方介绍把 App 定义为从 Agent Manager 演进的独立桌面入口。产品名称本身不提供安装目录、ASAR 布局或签名状态保证。[官方产品概览](https://www.antigravity.google/docs/overview?tab=ide)
- App 2.26.0 的官方发布日期为 **2026-10-22**，新增通知设置、停靠的提问和审批提示、会话筛选/排序等界面变化。因此 2.25.0 的 DOM、文案与 AST 注入点必须重新核对，不能只换版本字段。[官方更新日志](https://www.antigravity.google/docs/changelog?tab=hub)

官方页面 HTML 的 Windows x64 链接为：

[Antigravity App 2.26.0 Windows x64 安装包](https://storage.googleapis.com/antigravity-public/antigravity-hub/2.26.0-6546645232517120/windows-x64/Antigravity-x64.exe)

本轮只对该链接发出 HTTP HEAD：返回 200，Content-Length 为 **166335944** 字节，Last-Modified 为 **2026-10-22 21:35:18 GMT**，`x-goog-hash` 为 `crc32c=vWQ/3Q==`。这证明该公开对象当时存在，不等于已检查安装包签名、内容、SHA-256 或本机匹配。CRC32C 不是签名，也不能替代加密指纹。

## Electron ASAR 与 fuses：适用条件

- Windows 自 Electron 30 起支持内嵌 ASAR 完整性验证。启用 `EnableEmbeddedAsarIntegrityValidation` 时，ASAR 头部哈希缺失或不匹配会导致退出；Windows 的预期值放在 PE 资源 `Integrity` / `ElectronAsar` 内。`@electron/asar` 重新生成归档内部完整性数据，不会自动更新已安装程序的该 PE 资源。[Electron ASAR Integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)
- `OnlyLoadAppFromAsar` 限制应用代码搜索位置；它与完整性验证是两个不同开关。官方默认值不是 Google 分发二进制的实测值。应只读解析实际 EXE 的 fuse wire，并验证 schema、长度、状态；未知或异常状态拒绝安装。[Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- 官方工具提供 `@electron/fuses read` 读取任意 Electron 应用状态；不要把 `write` 或 `flipFuses` 当适配步骤。fuses 是可执行文件内的打包配置，应在发行者签名前配置。[官方 fuses 项目](https://github.com/electron/fuses)

**本项目的决策条件（工程推论）：**若目标启用 ASAR 强制校验，当前“仅替换 app.asar、保留 EXE”方案不可直接成立；应停止该安装路线并说明约束。不能把修改 EXE 资源、关闭 fuse、重签名或替换运行时混入“资源汉化”。若校验关闭，也只说明这一道机制不拦截，不能保证 App 自检、更新器或终端防护不拦截。

## Windows 签名与本机可信来源

主调查已提供的本机观察：App 2.26.0 位于 `C:\Users\Crazy\AppData\Local\Programs\antigravity`，`resources/app.asar` 为 4387714 字节，`resources/bin/language_server.exe` 为 177882624 字节，`version` 文件为 Electron 44.4.3；主 EXE 的 `Get-AuthenticodeSignature` 返回 **NotSigned**。这些是本机观察，不是本轮通过官方包独立比对的结果。

- `Get-AuthenticodeSignature` 查询单个文件的 Authenticode 状态；同时存在嵌入签名与 catalog 签名时使用 catalog 签名。读取产品名、版本字符串不替代签名校验。[Microsoft 官方命令文档](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-authenticodesignature?view=powershell-7.5)
- Authenticode PE 哈希覆盖映像节的数据，仅排除规定范围。常规 PE 资源和 fuse 字节的改变会影响相应签名；不能套用 macOS 的“整个 app 包资源封印失效”描述。另一方面，仅有 EXE 签名通过也不能证明旁边独立 ASAR 的内容未经改变。[Microsoft PE 格式与 Authenticode 哈希](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#appendix-a-calculating-authenticode-pe-image-hash)

**建议的可信来源方案（尚未执行）：**

1. 由官方页面定位同版本、同架构安装包；记录公开 URL、下载时间、安装包 SHA-256 与安装包签名实际结果。
2. 不执行安装器，先研究其可验证提取方式，在隔离的临时目录提取原始文件；对主 EXE、ASAR、语言服务、预加载及待改模块建立指纹。只有逐项匹配后，才可把本机文件认定为“匹配本次官方渠道下载基线”。
3. 将“来源基线匹配”“Authenticode 状态”“补丁资源指纹”分别记录。如果官方分发内的 EXE 也未签名，就如实报告未签名，不能制造 Google 签名通过的状态。对其他未知未签名版本仍拒绝写入。

本机 `app-update.yml` 所列 `https://antigravity-hub-auto-updater-974169037036.us-central1.run.app/manifest/` 只能先作为本机配置线索；本轮试读其 `latest.yml` 返回 404，不能据此断言更新服务故障。未确认实际更新请求附加路径、参数或官方公开逐文件哈希清单。后续应阅读本机更新器实现定位实际请求，并核对与官方分发的关联；不要扫描猜测大量端点。

## Windows 文件替换：不能直接继承 macOS 保证

- libuv 的 Windows `fs__rename` 实现调用 `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`。这支持检查现有 `fs.rename` 方案的实现基础，但应对应最终采用的 Node/libuv 版本复核，不能由函数名称推出断电原子性。[libuv 官方源码](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c)
- Windows 的打开句柄共享方式可以阻止重命名；删除访问也涵盖重命名。进程退出检查有帮助，但其他持有句柄的进程仍可能使替换失败。[Microsoft CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)
- `MoveFileExW` 的跨卷复制选项会退化为复制/删除。因此临时归档应放在目标资源目录所在卷，不使用跨卷退化或延迟到重启的路径。[Microsoft MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
- `ReplaceFileW` 可保留原文件的 DACL、部分属性及流，要求替换文件、目标和备份同卷；文档明确若干失败可能留下不同文件状态，且 `REPLACEFILE_WRITE_THROUGH` 不受支持。它也不是免除日志和恢复逻辑的保证。[Microsoft ReplaceFileW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew)

**建议实现方向（尚未执行）：**把替换、ACL/属性保留、错误分类放进 Windows 平台接口。先在临时测试目录比较现有 Node rename 与必要时的原生 ReplaceFile 行为；按原文件/暂存文件/备份文件的实际哈希恢复，而不只相信最后写入的 journal 阶段。归档、标记文件与日志是多个写入，必须测试任何相邻写入之间中断。不得以删除目标后再复制作为重命名失败的兜底。

## 实施前仍需回答

- 本机 EXE 的实际架构、fuse 状态、PE 完整性资源，以及是否与官方同版本包逐文件一致。
- Windows 2.26.0 的七个待改模块、AST 匹配数量、前端版本和未打包依赖结构；不要沿用 macOS arm64 指纹。
- `NotSigned` 是否也出现在官方同版本安装包提取的 EXE；安装包本身是否签名。本轮没有下载该包，故未知。
- Windows ACL、只读属性、文件占用、中文/空格/长路径、写入失败、更新发生在事务期间、启动健康确认和恢复的实际表现。
- UI 注入是否仍保护用户输入、对话正文、代码、模型/项目名称。官方更新日志只说明界面变更，不能证明现有选择器在新版本安全。

仅在以上检查成立后，才能在后续实施阶段声明此台机器受支持。本轮官方资料支持方案设计，不构成安装成功或完整安全性的实测证明。
