# AgyFlux 图标

`agyflux-source.png` 是原始图像。`agyflux-rounded-source.png` 是带透明四角的导出母版。

## Windows

`../../src-tauri/icons/icon.ico` 内含 16 档 32 位 PNG 帧，尺寸为 16、20、24、30、32、36、40、48、60、64、72、80、96、128、192、256 px。独立 PNG 保存在 `../../src-tauri/icons/windows/`。

## 资源

| 位置 | 用途 |
| --- | --- |
| `../../src-tauri/icons/icon.ico` | Windows 程序及安装包 |
| `../../src-tauri/icons/icon.png` | Windows / Linux 系统托盘 |
| `../../src-tauri/icons/icon.icns` | macOS 应用图标 |
| `../../src/assets/logo.png` | 应用导航栏标志 |
| `../../public/` | 网站图标和预览资源 |
| `agyflux-1024.png` | 1024 px 通用图标 |
| `icon-manifest.json` | 图标尺寸与导出规格 |

macOS 菜单栏使用独立的单色图标。

## 生成

在项目根目录运行 `npm run icons`。脚本按导出母版生成各平台资源，并将各档 Windows 图像封装进 ICO。
