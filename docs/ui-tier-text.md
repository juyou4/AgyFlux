# 套餐等级渐变文字

日期：2026-11-17

参考 `E:\ui动效\03-微交互与动效\Pro渐变文字-色彩光晕环绕循环.html`，将五组径向色彩沿闭合轨道运行的效果用于 Pro、Ultra 套餐文字，保留原示例的 8.4 秒周期。按小字号调整日间字色，深色主题使用更明亮的配色。

## 改动

- 新增 `src/components/motion/OrbitGradientText.tsx`：文字内部的五色循环。所有可见标签共享一个动画时钟；离开可见区域、文档隐藏、开启减弱动态效果或强制颜色模式时停止更新；组件卸载后清理监听和动画。
- 新增 `src/components/accounts/AccountTierBadge.tsx`：套餐标签统一展示。沿用现有套餐分类，保留后端返回的付费等级后缀，只移除 `Google AI` 展示前缀；Free、Unknown 保留普通文字。
- 修改 `src/styles/motion.css`：标签样式、深浅主题配色和强制颜色模式下的可读文字回退。
- 修改 `src/pages/Accounts.tsx`、`Overview.tsx`、`MenuBarDashboard.tsx`、`Settings.tsx`：接入账号卡片/列表、概览、快捷面板和自动切换候选账号的套餐标签。

本轮没有新增运行依赖，没有改动套餐判断、账号切换或授权逻辑。修改前的五个已有源码文件保存在 `.repair/tier-text-before/`。

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm.cmd run build` | 通过 TypeScript 检查和 Vite 构建；保留现有混合导入、大分块提示。 |
| `npm.cmd test` | 13/13 通过。 |
| `node .repair/tier-text-check.mjs` | Chromium 149.0.7827.55 下 6 组场景通过，无页面运行异常。 |

浏览器检查覆盖：套餐等级显示、连续渐变、文字尺寸稳定、滚出屏幕后暂停和恢复、减弱动态效果、强制颜色模式、深色英文窄窗口、卡片/列表切换、页面往返、概览/设置/快捷面板，以及套餐后缀和未知等级。

700 毫秒采样中出现 43 个不同的渐变画面，文字宽高保持一致。后缀验证通过仅在测试浏览器中注入 `Ultra 20x`、`Pro Plus` 完成；它们是展示边界样例，不代表确认存在这些真实产品套餐。源文件 `previewMock.ts` 未改动。

日志：`.repair/tier-text-build.log`、`.repair/tier-text-tests.log`、`.repair/tier-text-check.log`；结构化报告：`.repair/tier-text-check.json`。

已查看预览截图：`.repair/tier-text-light-card.png`、`.repair/tier-text-dark-card.png`；另有完整页面和英文列表截图。

本轮仅使用浏览器预览账号验证，没有进行原生桌面运行验证或打包；现有 Windows EXE 和安装包未更新。
