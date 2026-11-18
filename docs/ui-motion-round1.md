# 第一轮交互动效优化

日期：2026-11-17

## 已实现

| 交互 | 行为 | 对应文件 |
| --- | --- | --- |
| 账号切换反馈 | 加载、成功、失败重试；阻止重复提交；切换卡片/列表视图仍保留执行状态。切换异常继续抛给按钮，避免失败后误报成功。 | `src/pages/Accounts.tsx`、`src/components/motion/MorphActionButton.tsx` |
| 授权状态胶囊 | 根据授权状态展开步骤、显示倒计时、取消、错误和成功；手动回调区平滑展开；成功后聚焦完成按钮。 | `src/components/accounts/OAuthStatusCard.tsx`、`src/components/accounts/OAuthLoginPanel.tsx` |
| 账号更多菜单 | 圆钮展开为菜单，复用刷新配额、预热、导出、设备指纹操作；独立浮层避免裁切，靠近窗口底部向上展开；支持方向键、Home/End、Esc、Tab。 | `src/components/motion/MorphActionMenu.tsx`、`src/pages/Accounts.tsx` |
| 首次加载骨架 | 卡片和列表各自匹配占位；后台刷新保留已有账号；首次读取失败、成功空列表与加载中分别显示。 | `src/components/accounts/AccountsSkeleton.tsx`、`src/stores/useAccountStore.ts`、`src/pages/Accounts.tsx` |
| 状态图标和公共样式 | 绘制成功/失败图标，统一过渡曲线；兼容系统减弱动态效果设置。 | `src/components/motion/StatusIcon.tsx`、`src/styles/motion.css` |
| 菜单到弹窗的键盘操作 | 打开设备指纹弹窗后聚焦关闭按钮，Esc 关闭并恢复入口焦点；同步菜单操作不短暂禁用入口按钮。 | `src/components/accounts/DeviceFingerprintModal.tsx`、`src/components/motion/MorphActionMenu.tsx` |

授权胶囊使用现有流程状态。手动回调提交后进入验证保存态；浏览器自动回调没有单独的保存阶段通知时，允许从等待直接到成功，不额外模拟中间进度。

参考本机 `E:\ui动效` 的智能体状态胶囊、六种任务状态图标、14 号项目操作菜单和 23 号骨架屏示例；沿用项目现有组件和动效基础，没有新增运行依赖。

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm.cmd run build` | 通过，包含 TypeScript 检查和 Vite 构建。仍有现有混合导入及大分块提示，主 JS 约 882.56 kB。 |
| `npm.cmd test` | 13/13 通过。 |
| `node .repair/motion-round1-check.mjs` | 8 组浏览器场景通过，无页面运行异常。 |
| `node .repair/ui-motion-check.mjs` | 7 组既有导航和下拉框交互回归通过，无页面运行异常。 |
| `node .repair/motion-round1-preview.mjs` | 生成干净的菜单与授权状态预览截图，并人工查看。 |

浏览器为 Chromium 149.0.7827.55。新增场景覆盖：首次加载、失败重试、防连点、四个菜单动作、菜单和弹窗的键盘焦点、授权准备失败/取消/错误回调/保存成功、底部菜单、切换视图期间的在途操作、深色英文窄窗口、减弱动态效果、首次读取失败后重试为空列表。

逐帧采样中，菜单宽度出现 25 个不同值，授权面板高度出现 39 个不同值，确认过渡包含连续的中间帧。这是本机浏览器验证，不代表对所有设备帧率的保证。

日志和报告位于 `.repair/motion-round1-{build,tests,check,baseline-check}.log`、`.repair/motion-round1-check.json`、`.repair/ui-motion-check.json`。修改前的相关文件保存在 `.repair/motion-round1-before/`。

预览截图：

- `.repair/motion-round1-preview-menu.png`
- `.repair/motion-round1-preview-oauth.png`
- `.repair/motion-round1-skeleton.png`
- `.repair/motion-round1-dark-en.png`

## 验证范围

浏览器使用现有预览账号；失败、等待等条件只在测试浏览器内注入，未改写 `previewMock.ts`。没有操作真实账号、进行真实 Google 授权、修改后端或验证原生桌面运行效果。

本轮未运行 Tauri 打包，没有更新 Windows 安装包、便携包或正在运行的旧 EXE。`npm.cmd run build` 仅更新前端 `dist`。
