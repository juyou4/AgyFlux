use std::process::Command;

use crate::models::config::NetworkPreferences;

const LOCAL_BYPASS: &str = "localhost,.localhost,127.0.0.1,127.0.0.0/8,::1";

pub(super) fn configure(
    command: &mut Command,
    args: &[String],
    target: Option<&str>,
    settings: &NetworkPreferences,
) -> Result<(), String> {
    let proxy = match target {
        None | Some("app" | "all") => settings.antigravity_proxy_url()?,
        _ => None,
    };
    let Some(proxy) = proxy else {
        command.args(args);
        return Ok(());
    };
    // Electron 的网络进程读取启动参数，语言服务和它的子进程读取环境变量。
    command.arg(format!("--proxy-server={proxy}"));
    for key in ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "grpc_proxy"] {
        command.env(key, &proxy);
    }
    for key in ["NO_PROXY", "no_grpc_proxy"] {
        command.env(key, LOCAL_BYPASS);
    }
    // Chromium 自带本机回环豁免。启用规则代理时移除与之冲突的旧代理参数。
    let mut args = args.iter().peekable();
    while let Some(arg) = args.next() {
        if arg == "--" {
            command.arg(arg).args(args);
            break;
        }
        let (key, value) = arg
            .split_once('=')
            .map_or((arg.as_str(), None), |(k, v)| (k, Some(v)));
        match key {
            "--proxy-server" | "--proxy-pac-url" | "--proxy-bypass-list" => {
                if value.is_none() && args.peek().is_some_and(|v| !v.starts_with('-')) {
                    args.next();
                }
            }
            "--no-proxy-server" | "--proxy-auto-detect" => {}
            _ => {
                command.arg(arg);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn launch_antigravity_with_proxy() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let config = super::config::load_app_config()?;
        if config.network.antigravity_proxy_url()?.is_none() {
            return Err("client_proxy_off".into());
        }
        // 已运行的 Electron 主进程会接管新窗口，并沿用原来的环境。
        if super::process::is_antigravity_running(None) {
            return Err("client_proxy_app_running".into());
        }
        super::process::start_with_config(None, false, config)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::config::ProxyMode;

    #[test]
    fn client_targets_replace_conflicting_flags_and_preserve_other_arguments() {
        let settings = NetworkPreferences {
            proxy_mode: ProxyMode::Manual,
            proxy_url: "http://localhost:1234".into(),
            proxy_antigravity: true,
        };
        let args = [
            "--no-proxy-server", "--proxy-server", "old", "--proxy-pac-url=old",
            "--proxy-bypass-list=<-loopback>", "--user-data-dir", "a b", "--", "--proxy-server=file",
        ].map(String::from);
        for target in [None, Some("app"), Some("all")] {
            let mut child = Command::new("app");
            configure(&mut child, &args, target, &settings).unwrap();
            assert_eq!(
                child.get_args().collect::<Vec<_>>(),
                ["--proxy-server=http://localhost:1234", "--user-data-dir", "a b", "--", "--proxy-server=file"]);
            for (key, expected) in [
                ("http_proxy", "http://localhost:1234"),
                ("https_proxy", "http://localhost:1234"),
                ("all_proxy", "http://localhost:1234"),
                ("grpc_proxy", "http://localhost:1234"),
                ("no_proxy", LOCAL_BYPASS),
                ("no_grpc_proxy", LOCAL_BYPASS),
            ] {
                assert!(child.get_envs().any(|(k, v)|
                    k.eq_ignore_ascii_case(key) && v == Some(expected.as_ref())));
            }
        }
        let disabled = NetworkPreferences { proxy_antigravity: false, ..settings.clone() };
        for (target, prefs) in [(None, &disabled), (Some("ide"), &settings), (Some("vscode"), &settings)] {
            let mut child = Command::new("app");
            configure(&mut child, &args, target, prefs).unwrap();
            assert_eq!(child.get_args().collect::<Vec<_>>(), args.each_ref().map(std::ffi::OsStr::new));
            assert_eq!(child.get_envs().count(), 0);
        }
    }

    #[test]
    fn switch_restart_reads_the_saved_proxy_and_scopes_it_to_the_spawned_client() {
        use std::fs;
        use std::path::PathBuf;
        use std::time::{Duration, Instant};

        const FIXTURE_VAR: &str = "AGYFLUX_TEST_CLIENT_RESTART_DIR";
        const TEST: &str = "modules::client_proxy::tests::switch_restart_reads_the_saved_proxy_and_scopes_it_to_the_spawned_client";
        if let Some(dir) = std::env::var_os(FIXTURE_VAR) {
            let dir = PathBuf::from(dir);
            let config = crate::modules::config::load_app_config().unwrap();
            let fixture = dir.join("fixture-client.exe");
            assert_eq!(std::env::var_os("ABV_DATA_DIR").as_deref(), Some(dir.as_os_str()));
            assert_eq!(config.antigravity_executable.as_deref(), fixture.to_str());
            assert!(fixture.is_file());
            crate::modules::process::start_antigravity(Some("app")).unwrap();
            return;
        }

        // 用独立进程读取临时 AgyFlux 配置，子客户端只记录继承的 HTTPS_PROXY。
        let root = tempfile::tempdir().unwrap();
        let fixture = root.path().join("fixture-client.exe");
        let interpreter =
            PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32/cmd.exe");
        fs::copy(interpreter, &fixture).unwrap();
        let inherited = "http://127.0.0.1:10001";
        let saved = "http://127.0.0.1:10002";
        for (enabled, expected, receipt) in [(true, saved, "enabled.txt"), (false, inherited, "disabled.txt")] {
            let config = crate::models::AppConfig {
                antigravity_executable: Some(fixture.to_str().unwrap().into()),
                antigravity_args: Some(vec![
                    "/D".into(), "/C".into(), "set".into(), format!("HTTPS_PROXY>{receipt}"),
                ]),
                network: NetworkPreferences {
                    proxy_mode: ProxyMode::Manual,
                    proxy_url: saved.into(),
                    proxy_antigravity: enabled,
                },
                ..Default::default()
            };
            let config_file = root.path().join("gui_config.json");
            fs::write(config_file, serde_json::to_vec(&config).unwrap()).unwrap();
            let result = Command::new(std::env::current_exe().unwrap())
                .args(["--exact", TEST])
                .env(FIXTURE_VAR, root.path())
                .env("ABV_DATA_DIR", root.path())
                .env("HTTPS_PROXY", inherited)
                .current_dir(root.path())
                .output()
                .unwrap();
            assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stdout));
            let expected_record = format!("HTTPS_PROXY={expected}");
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                if fs::read_to_string(root.path().join(receipt))
                    .is_ok_and(|s| s.trim().eq_ignore_ascii_case(&expected_record)) {
                    break;
                }
                assert!(Instant::now() < deadline, "客户端没有记录预期的代理");
                std::thread::sleep(Duration::from_millis(30));
            }
        }
    }
}
