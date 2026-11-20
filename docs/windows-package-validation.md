# Windows 构建与打包

## 构建安装包

准备 Node.js 22、Rust stable、Visual Studio C++ Build Tools 和 WebView2。在项目根目录运行以下命令。

```powershell
npm.cmd ci
npm.cmd run build
.\src-tauri\build.bat
```

脚本编译命令行程序并生成 NSIS 安装包。构建产物可在 `src-tauri/target/release/` 查看，安装包位于其 `bundle/nsis/` 目录。其他平台的交叉构建可参考 [Tauri 的 Windows 安装包文档](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos)。

## 包内程序

| 文件 | 用途 |
| --- | --- |
| `agyflux-desktop.exe` | 桌面应用 |
| `agyflux.exe` | 命令行工具 |
| `LICENSE` | 许可协议 |

可以从安装目录打开桌面应用，并运行 `agyflux.exe --version` 确认命令行版本。若发布包附带 `SHA256SUMS.txt`，可以用 PowerShell 的 `Get-FileHash -Algorithm SHA256` 检查下载文件。
