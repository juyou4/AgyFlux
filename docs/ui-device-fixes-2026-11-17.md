# 下拉菜单、导航动效与设备指纹兼容修复

## 修复内容

- `src/styles/motion.css`：补齐 `.mk-dd-*` 和 `.mk-capnav-*` 样式。收起菜单时隐藏选项层；展开时外壳形变、选项渐显、高亮跟随。导航按钮宽度、标签槽和滑块共用 416ms 弹簧曲线，标签去模糊浮现；系统减弱动态效果时同时清除延迟。
- `src/components/motion/DropdownSelector.tsx`：测量文案固有宽度，避免换成长标签后仍受旧宽度限制；使用明确的收起尺寸，并隐藏关闭列表的无障碍内容。
- `src-tauri/src/models/account.rs`、`src-tauri/src/modules/device.rs`：将 `mac_machine_id` 改为可缺省。读取和备份不生成替代值；恢复缺省指纹时删除嵌套和扁平格式中的该字段。旧版四字段备份仍能读取，其余三个必需字段和损坏文件的校验保留。
- `src/types/account.ts`、`src/components/accounts/DeviceFingerprintModal.tsx`：同步可缺省类型；界面显示“客户端未提供”，不提供空值复制按钮。

## 问题证据

菜单与导航原来已有状态逻辑，但对应 CSS 缺失。`inert` 只禁用交互，不能隐藏菜单选项，因此关闭后仍出现重复文字和勾选图标；导航的几何变化也没有过渡。

只读检查本机 Antigravity 的 `storage.json`，确认 `telemetry.machineId`、`telemetry.devDeviceId`、`telemetry.sqmId` 存在，`telemetry.macMachineId` 缺失。原来的 `read_profile` 要求四项齐全，首次备份设备指纹时会返回 `missing_mac_machine_id`，从而中断后续操作。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| `npm.cmd run build` | 通过；保留既有分块大小及混合导入提示 |
| `npm.cmd test` | 13/13 通过 |
| Chromium 无头浏览器交互检查 | 7 项通过：收起隐藏、展开选择与焦点恢复、键盘与宽度变化、导航逐帧滑动、快速切换落位、英文标签、减弱动态效果 |
| 导航帧采样 | 46 帧、17 个不同位置；快速往返后滑块位置及宽度误差均为 0px |
| Windows 原生设备指纹测试 | 6/6 通过：缺省字段、旧格式、备份恢复、必需字段校验、损坏文件、写入失败回滚 |
| Windows 原生切换写入集成测试 | 5/5 通过；隔离临时文件及模拟凭据回调 |

新增设备指纹回归测试覆盖扁平与嵌套 JSON，并验证“备份缺省状态 → 写入生成指纹 → 恢复备份”后两个位置的 `macMachineId` 都不存在、其他数据保留、数据库设备标识同步。

本次未修改真实客户端配置、未执行真实账号切换。浏览器检查使用预览数据；Windows 测试使用临时目录。遵照用户要求，未重新打包或替换正在运行的 EXE。

本机验证日志与截图保存在 `.repair/ui-motion-check.json`、`.repair/ui-motion-*.png`、`.repair/ui-device-frontend-*.log`、`.repair/device-profile-native-tests.log`、`.repair/device-profile-integration-tests.log`。原生测试程序通过 `.build-tools/cross/test-windows.sh` 构建，运行参数分别为 `modules::device:: --test-threads=1` 和 `modules::integration::scope_tests:: --test-threads=1`。
