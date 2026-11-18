# CC Switch 登录流程整合

日期：2026-11-17。范围按用户决定：借鉴授权中心的添加账号流程，仍然只管理 Antigravity 账号。

## 源码来源

已从官方仓库获取当时 `main` 的完整源码快照，版本为 **4.0.33**，提交为 [`ed6d51e590ff8a34431ca60eacfc78e12704075b`](https://github.com/farion1231/cc-switch/commit/ed6d51e590ff8a34431ca60eacfc78e12704075b)，提交时间为 `2026-11-17T02:45:03Z`，获取时间为 `2026-11-17T03:15:38Z`。

源码位于 `E:\Project\external-references\cc-switch`，同目录的 `SOURCE_SNAPSHOT.json` 记录来源与提交。下载方式为 GitHub 官方 codeload 提交归档；目录不含 Git 历史。归档 ZIP 保留在 `external-references` 下。MIT 许可保留于本项目 `third-party/cc-switch.LICENSE`。

参考位置：

| CC Switch 源码 | 本次采用的行为 |
| --- | --- |
| `src/lib/authLoginLink.ts` | 自动打开浏览器的本机偏好；关闭偏好时复制登录链接 |
| `src/components/providers/forms/hooks/useManagedAuth.ts` | 独立登录会话、取消、过期与旧请求隔离 |
| `src/components/providers/forms/AgyOAuthSection.tsx` | 添加账号、等待结果、成功与重试的交互 |
| `src-tauri/src/services/agy_account/oauth.rs` | Google 账号选择、离线授权与 S256 PKCE |

## 使用方式

入口为“账号 → 添加账号 → Google 授权”。默认自动打开浏览器；关闭该选项后会复制链接，方便选择其他浏览器或无痕窗口。

等待页显示授权链接、剩余时间和取消按钮。自动回调不可用时，展开“回调没有自动完成？”，粘贴本次登录的完整回调地址或授权码。提交后继续等待同一会话，无需再次点击登录。成功页显示邮箱，可选择“再添加一个”或“完成”。账号保存后立即返回，初始额度在后台更新。

浏览器预览模式不会调用 Google、扫描凭据或启动真实登录。开始模拟授权后，提交 `preview-code` 可演示成功状态；生成的账号仅保存在预览内存中。

### 从公开源码配置 Google 授权

从 GitHub 构建的程序需要一个有相应权限的 Google 桌面 OAuth 客户端。启动程序前，可在当前终端设置客户端，应用会沿用该配置发起登录和刷新令牌。

```powershell
$env:ANTIGRAVITY_OAUTH_CLIENTS = 'desktop|<客户端 ID>|<客户端密钥>|Google Desktop'
```

本地构建也可以在未纳入 Git 的 `.cargo/config.toml` 中设置以下变量。

```toml
[env]
AGYFLUX_GOOGLE_OAUTH_CLIENT_ID = "<客户端 ID>"
AGYFLUX_GOOGLE_OAUTH_CLIENT_SECRET = "<客户端密钥>"
```

已有刷新令牌与签发时的 OAuth 客户端绑定。更换客户端后，请使用新客户端重新授权。

## 修复与实现

旧窗口在等待登录时禁用了手动提交按钮；手动提交又调用一次完成命令，可能替换原来的授权会话。现在前端通过 `oauthLoginFlow.ts` 管理流程，`OAuthLoginPanel.tsx` 负责展示，只有一个完成等待者。

新增 `prepare_oauth_login`、`open_oauth_login`、`finish_oauth_login` 命令。准备命令只返回会话标识、授权链接和剩余时间；打开浏览器时由后端取出对应会话的链接。取消与手动提交均携带会话 ID，旧请求不能取消或完成新会话。

自动回调与手动回调共用后端通道。完整回调地址必须与本次地址的协议、主机、端口、路径和 state 一致；拒绝重复 code/state 参数。裸授权码绑定当前会话，并通过 PKCE 兑换校验。PKCE 的随机 verifier 留在后端内存，只将 S256 challenge 放进授权链接。

关闭添加窗口、切换导入方式或点击取消均释放当前会话；关闭时尚未返回的准备请求也会在返回后被取消。后端五分钟期限覆盖等待回调、兑换令牌、读取资料和提交前检查。账号持久化前在同一把锁下重新校验会话；已经提交保存的结果会报告成功，不会误报取消。后台额度查询不阻塞登录完成。

浏览器偏好只在 localStorage 中存一个布尔值，不同步设置，也不保存授权链接、回调码或令牌。成功响应继续使用既有 `AccountView`，不把访问令牌、刷新令牌返回界面。

没有移植多平台授权账号模型，也没有接入 API 网关。原有令牌、JSON 和本机导入入口继续保留。

## 验证

前端使用 Windows、Node.js 22.20.0；后端使用 WSL Ubuntu 24.04、Rust 1.100.0。测试只使用合成账号、临时数据与本地回环连接，没有执行真实 Google 授权、账号切换或预热。

- `npm test`：13 项通过，包含本次新增的 11 项登录会话与偏好测试。
- `npm run build`：TypeScript 检查和 Vite 构建通过；仍有原有的大包与混合动态导入提示。
- `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml --all-targets`：库、程序、测试和默认启用的示例全部通过编译检查。
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1`：298 项通过，0 失败，6 项按原设计忽略。其中 OAuth 回环与会话模块共 12 项测试通过，覆盖无效回调、重复参数、取消期间的保存阻断、旧会话隔离、期限、已提交结果和 PKCE 标准向量。
- Tabbit 的 `diagnose` 与 `tabs` 返回 69（浏览器实例路由不可用），未完成浏览器操作与目视验收；没有切换到用户的其他浏览器。
- Windows 原生构建、真实 Google 授权和原生打开浏览器仍需专用测试账号环境验收。

本次修改前的源码备份：`.repair/ccswitch-login-before`。最终后端验证日志：`.repair/ccswitch-check-final.log`、`.repair/ccswitch-tests-final.log`。11 个已修改文件与 4 个新增源码、测试、文档文件的差异空白检查通过。
