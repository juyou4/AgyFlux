# AgyFlux

面向 **Google Antigravity** 的多账号管理与额度监控桌面客户端，基于 React 19、TypeScript、Tauri 2 与 Rust 构建，并附带同源命令行工具 `agyflux`。

![AgyFlux 概览（演示数据）](assets/screenshots/overview.png)

![AgyFlux 账号管理（演示数据）](assets/screenshots/accounts.png)

## 核心特性

- **多方式账号接入**：支持 Google OAuth 登录（S256 PKCE 校验、浏览器偏好记忆、手动回调兜底，本机 `google-oauth.json` 放入数据目录即可热加载生效）、Refresh Token / JSON 批量导入导出，以及本机客户端扫描诊断与 `.vscdb` / `.json` 文件手动导入。
- **稳定读取与多客户端切换**：独立识别并切换 `App`、`IDE`、`CLI (agy)` 与 `VS Code`，明确区分「运行中会话」、「已保存凭据」与未确认状态；支持多条目数据库解析与令牌轮换后的邮箱匹配，切号写入采用 SQLite 事务、文件锁退避重试与 Windows 子进程收尾，同时保护独立运行的 CLI/Sidecar 进程。
- **Windows 免 TUN 代理**：在「设置 → 客户端与网络」中选择手动 HTTP / 混合代理并开启「Antigravity 免 TUN」后，从 AgyFlux 启动或切号自动重启客户端时，会自动注入代理参数与环境变量并豁免本地回环地址。
- **模型白名单与额度监控**：仅展示账号对话菜单中真实可选的模型，原生后台按周期自动刷新配额并同步系统托盘；汇总 5 小时 / 每周额度窗口、Gemini 4 Argon / Carbon 周池及临期重置提醒，支持 API 折算与本地 Token 用量统计（输入 / 输出 / 缓存占比、首字延迟、输出速度）。
- **智能推荐与后台自动切号**：根据余量与重置时间自动推荐备用账号；支持按触发阈值、基准模型、优先级（P 值）或轮换策略后台切换，可配置「空闲时安全切换」、低余量模型保护与设备指纹绑定/备份。
- **托盘快捷面板与外观**：提供轻量常驻的托盘快捷面板（支持置顶、快速切号与实时状态同步），支持浅色 / 深色 / 跟随系统主题及简体中文 / English 双语切换。

## 快速开始

### 桌面端使用与数据隔离

- **数据目录**：默认使用 `~/.antigravity_tools`，可通过环境变量 `ABV_DATA_DIR` 指定独立目录以隔离不同环境数据。
- **Google OAuth 客户端配置**：登录、导入验证与令牌续期需使用本机 OAuth 客户端配置（不会内置密钥到公开仓库），在数据目录保存 `google-oauth.json` 即可即时生效，详见 [Google OAuth 登录说明](docs/google-oauth.md)。
- **包与标识**：npm / Cargo 包名为 `agyflux`，桌面端主程序为 `agyflux-desktop`，CLI 为 `agyflux`，应用标识为 `com.agyflux.app`。
- **更新策略**：当前版本为 `1.0.0`，默认关闭自动更新安装通道。

### 本地开发

需要准备 **Node.js 22**、**Rust stable** 以及对应平台的 Tauri 2 构建依赖（Windows 原生构建需安装 Visual Studio C++ Build Tools 与 WebView2）。

```powershell
npm ci
npm run dev
```

`npm run dev` 会启动基于内置模拟数据的 Vite 浏览器预览（端口 `1420`），不会读取或修改真实 `~/.antigravity_tools` 数据，按 `Ctrl+C` 即可停止。

如需启动连接 Rust 后端的完整桌面窗口，建议先指定独立测试目录再运行：

```powershell
$env:ABV_DATA_DIR = './.local-data'
npm run tauri dev
```

## 测试与构建

```powershell
npm test                  # 前端单元测试
npm run build             # TypeScript 检查与 Vite 生产构建
npm run test:backend      # Rust 后端单元测试（使用临时目录与合成数据）
npm run check:backend     # Rust 全目标编译检查
npm run icons             # 从母版重新生成桌面与网页图标
```

> **提示**：后端测试默认跳过依赖真实凭据库或真实客户端进程的用例；请勿在日常账号目录下执行 `cargo test -- --ignored`。

在具备 Windows 原生 Rust 与 MSVC 工具链的环境中，可直接运行 `src-tauri\build.bat` 构建 `agyflux` CLI 与 NSIS 安装包（产物默认输出至 `src-tauri/target/release/` 及其 `bundle/nsis/` 目录，不纳入 Git 版本控制）。

## 相关文档

- [Google OAuth 登录说明](docs/google-oauth.md) — 本机 OAuth 客户端配置、PKCE 与手动回调机制
- [后端架构与数据边界](docs/backend-repair.md) — 账号状态一致性、凭据隔离与切换写入规则
- [Windows 构建与打包](docs/windows-package-validation.md) — 安装包构建流程与包内程序说明
- [品牌图标与资源说明](assets/branding/README.md) — 图标母版与多分辨率导出规范

## 许可协议

本项目采用 [CC-BY-NC-SA-4.0](LICENSE) 许可协议。
