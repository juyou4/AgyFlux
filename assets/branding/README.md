# AgyFlux 图标

采用用户提供的第二张候选图 `White Orbit Arrow App Icon.png`：渐变底色、白色 A 和彩色双向轨道。原图按字节保留为 `agyflux-source.png`（1254 × 1254）。当前导出母版为 `agyflux-rounded-source.png`：按用户要求，通过内置 imagegen 保留图案与配色，制作圆角方形和透明四角；随后使用 Tauri 图标工具缩放导出。

## Windows

主文件：`../../src-tauri/icons/icon.ico`。一个 ICO 内包含 16 档独立图像，均为 32 位 RGBA PNG：

`16、20、24、30、32、36、40、48、60、64、72、80、96、128、192、256 px`

各档 PNG 同时保存在 `../../src-tauri/icons/windows/`。这覆盖了 Windows 常用位置与高 DPI 显示所需的尺寸。Windows 会优先选择匹配尺寸，没有对应尺寸时缩小较大的图像；最低建议包含 16、24、32、48、256 px。参见 [Microsoft Windows 图标规范](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction)。

已在 Windows 上使用 `LoadImageW`、`GetIconInfo` 和 `GetObjectW` 逐档加载验证，全部得到对应宽高和 32 位色深，并检查了 16、32、128 px 的导出图。

## 已接入的资源

| 位置 | 用途 |
| --- | --- |
| `../../src-tauri/icons/icon.ico` | Windows 程序及安装包 |
| `../../src-tauri/icons/icon.png` | Windows / Linux 系统托盘 |
| `../../src-tauri/icons/icon.icns` | macOS 应用图标 |
| `../../src-tauri/icons/32x32.png` 等 | Tauri 多平台打包资源 |
| `../../src/assets/logo.png` | 应用导航栏标志 |
| `../../public/favicon.ico`、`icon.png`、`logo.png` | 浏览器图标和预览资源 |
| `agyflux-1024.png` | 1024 px 通用母版 |
| `agyflux-rounded-source.png` | 当前圆角透明导出母版 |
| `agyflux-source.png` | 用户选定的原始方形图片，保留不覆盖 |
| `icon-manifest.json` | 图标尺寸与生成方式清单 |

macOS 菜单栏沿用独立的单色 A 形模板，保持随系统主题显示的能力。

## 重新生成

```powershell
cd E:\Project\AgyFlux
npm run icons
```

生成脚本为 `../../scripts/generate-icons.mjs`，使用项目内的 Tauri CLI，按圆角透明母版缩放，再把各档图像封装进同一个 ICO。所有项目使用的图标均存放在仓库内。首次替换前的图标备份位于 `.repair/icons-before-agyflux`，本轮圆角调整前的文件备份位于 `.repair/rounded-icon-before`。

圆角图使用内置 imagegen 编辑，没有调用 API/CLI 生成路径。提示词要点：只将外轮廓改成圆角约为边长 22% 的平滑方形，四角真正透明；保留白色 A、彩色双向轨道及原渐变色，不添加描边、投影、文字或背景。完整提示词和本轮验证见 `../../docs/oauth-result-card.md`。

当前验证覆盖图标文件、Windows 原生图标加载和前端生产构建；Windows 桌面程序及安装包仍待原生工具链打包验收。

AgyFlux 改名后的 `npm test` 13 项通过，`npm run build` 通过。WSL 下 `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --all-targets -- --test-threads=1` 编译并验证所有默认目标：库测试 298 项、示例测试 33 项通过，6 项按原设计忽略。日志保存在 `.repair/agyflux-backend-tests.log`。
