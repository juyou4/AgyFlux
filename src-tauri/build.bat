@echo off
setlocal
cd /d "%~dp0"
rem 将 CLI 与桌面包统一输出到项目自己的 target 目录。
set "CARGO_TARGET_DIR=%CD%\target"
cargo build --locked --release --bin agyflux
if errorlevel 1 exit /b %errorlevel%
cd ..
call npm run tauri -- build --bundles nsis --config src-tauri/tauri.windows.bundle.conf.json -- --locked
exit /b %errorlevel%
