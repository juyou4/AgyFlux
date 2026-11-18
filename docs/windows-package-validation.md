# Windows 打包与验证（2026-11-17）

本次生成 AgyFlux 1.0.0 的 Windows x64 NSIS 安装包和免安装 ZIP。产物在 `release/windows-x64/`，不纳入源码版本控制。

## 打包修复

- 补齐 `scripts/fixtures/windows-desktop.manifest`。`src-tauri/build.rs` 原先引用了不存在的文件，Windows 链接因此失败；清单声明与 Tauri 默认配置一致的 Common Controls v6 依赖。
- Windows 包附带 CLI、项目许可和 CC Switch 许可。
- `src-tauri/build.bat` 改为在项目目录构建 CLI 和 NSIS 包，移除原来的固定 `D:\temp_a` 路径。

## 构建环境

本机没有原生 Rust/MSVC 工具链，C 盘空间不足，因此使用位于 E 盘的 WSL MyNoble 交叉构建。按照 [Tauri 官方交叉构建说明](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos) 使用 MSVC 目标和 NSIS。

- Rust 1.100.0，目标 `x86_64-pc-windows-msvc`。
- cargo-xwin 0.23.1、Clang/LLVM 19.1.1、Tauri CLI 2.12.5。
- 微软 CRT 14.44、Windows SDK 10.0.26100。
- 新增工具和缓存位于 E 盘上的 WSL `/opt/antigravity-switch-build/`。
- 使用 Tauri 默认的混合 CRT 链接；不额外设置 cargo-xwin 的 `+crt-static`，避免两套 UCRT 链接选项冲突。

本机复现命令（需要保留已经准备好的 `.build-tools` 和 WSL 工具目录）：

```powershell
cd E:\Project\AgyFlux
npm run build
wsl -d MyNoble -u root -- bash /mnt/e/Project/AgyFlux/.build-tools/cross/build.sh
wsl -d MyNoble -u root -- bash /mnt/e/Project/AgyFlux/.build-tools/cross/bundle.sh
```

具备 Windows 原生 Rust、MSVC C++ Build Tools 和 WebView2 的环境，可从项目根目录运行 `src-tauri\build.bat`。本次实际使用的是上述 WSL 路线，未运行原生编译脚本。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 前端生产构建 | 通过；保留现有 Vite 大分块提示 |
| Windows release 编译 | 桌面程序和 CLI 均生成 |
| Windows CLI | 版本、空账号列表、默认切换策略、更新通道状态均正常 |
| 原子文件写入 | Windows 原生测试 2/2 通过 |
| 设置持久化与并发合并 | Windows 原生测试 14/14 通过 |
| OAuth 会话、回调校验、取消、超时、PKCE | Windows 原生测试 12/12 通过；使用合成数据，不访问真实 Google 账号 |
| 桌面启动 | 免安装版和安装版均启动，窗口可响应 |
| 页面与图标 | 观察到中文概览、账号空列表、新 AgyFlux 图标；添加账号窗口正常打开 |
| NSIS 安装 | 在独立的 E 盘测试目录安装成功，退出码 0 |
| 最终产物校验 | 安装后的 EXE、CLI、许可与交付文件 SHA-256 一致；ZIP 内 EXE 与交付 EXE 一致 |
| NSIS 卸载 | 退出码 0；测试程序及卸载注册项已移除，并清除指向测试目录的安装位置记录 |
| EXE 元数据 | ProductName/FileDescription 为 AgyFlux，FileVersion 为 1.0.0，内含 Common Controls 清单 |

账号测试使用 `.local-data/windows-smoke`，关闭自动同步、自动刷新和启动更新检查。WebView 数据也放在该测试目录。概览仍会按产品原有逻辑只读本地客户端用量日志；未对真实账号执行添加或切换。

首次空目录启动曾出现一次索引恢复原子替换被拒绝的警告，随后已成功生成空索引，重启未再出现；原子写入和设置持久化测试均通过。该瞬时警告的具体来源尚未定位。

界面自动化在打开添加账号窗口后出现工具错误 `Computer Use helper already has an active request`、`call get_window_state before using this window`、`unknown screenshotId screenshot-0`，所以授权等待和取消只完成原生后端测试，未完成该段界面点击验证。未验证真实 Google 授权、额度刷新、真实客户端切换，以及缺少 WebView2 的全新系统安装。安装包没有代码签名，自动更新通道仍关闭。

构建日志位于 `.repair/windows-cross-build-final.log`、`.repair/windows-bundle-final.log`；GUI 启动日志位于 `.repair/windows-smoke-stdout.log` 和 `.repair/windows-installed-stdout.log`。验证摘要位于 `.repair/windows-validation.json`。最终产物的摘要写入 `release/windows-x64/SHA256SUMS.txt`。
