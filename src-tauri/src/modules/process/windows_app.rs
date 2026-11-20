use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

pub(super) struct AppProcess {
    pub pid: u32,
    pub executable: Option<PathBuf>,
    pub args: Vec<String>,
}

fn is_node_sidecar(args: &[OsString], environment: &[OsString]) -> bool {
    // agy-node.cmd 复用桌面程序运行 Node，进程名和安装路径都与主进程相同。
    if environment.iter().any(|entry| {
        let bytes = entry.as_encoded_bytes();
        let key = b"ELECTRON_RUN_AS_NODE=";
        bytes.len() > key.len() && bytes[..key.len()].eq_ignore_ascii_case(key)
    }) {
        return true;
    }

    let mut args = args.iter().skip(1).map(|arg| arg.to_string_lossy()).peekable();
    while let Some(arg) = args.next() {
        if arg == "--" {
            break;
        }
        // 有些进程只允许读取命令行。仅按 sidecar 专用的预加载模块识别。
        let loader = if arg == "--import" {
            args.peek().map(|next| next.as_ref())
        } else {
            arg.strip_prefix("--import=")
        };
        if loader.is_some_and(|path| path.replace('\\', "/").to_ascii_lowercase()
            .ends_with("/sidecar_sdk/register_loader.js")) {
            return true;
        }
    }
    false
}

fn is_electron_child(args: &[OsString]) -> bool {
    for arg in args.iter().skip(1).map(|arg| arg.to_string_lossy()) {
        if arg == "--" {
            break;
        }
        if arg.starts_with("--type=") {
            return true;
        }
    }
    false
}

fn is_helper(args: &[OsString], environment: &[OsString]) -> bool {
    is_node_sidecar(args, environment) || is_electron_child(args)
}

pub(super) fn main_processes() -> Vec<AppProcess> {
    let config = crate::modules::config::load_app_config().unwrap_or_default();
    matching_processes(&config)
}

/// 返回同可执行文件下仍在运行的 Electron 子进程（如 --type=utility / renderer），
/// 严格排除 ELECTRON_RUN_AS_NODE=1 与 sidecar Node worker，避免切号时误伤 agy 进程，
/// 同时确保主进程退出后释放 state.vscdb / storage.json 文件锁。
pub(super) fn electron_child_pids() -> Vec<u32> {
    let config = crate::modules::config::load_app_config().unwrap_or_default();
    matching_electron_child_pids(&config)
}

fn matching_electron_child_pids(config: &crate::models::AppConfig) -> Vec<u32> {
    let canonical = |path: Option<&str>| path.and_then(|s| Path::new(s).canonicalize().ok());
    let app = canonical(config.antigravity_executable.as_deref());
    let ide = canonical(config.antigravity_ide_executable.as_deref());
    let expected_name = app.as_deref().and_then(Path::file_name)
        .unwrap_or(OsStr::new("Antigravity.exe"));
    let current_exe = super::get_current_exe_path();

    let mut names = System::new();
    names.refresh_processes_specifics(ProcessesToUpdate::All, ProcessRefreshKind::new());
    let pids: Vec<_> = names.processes().iter()
        .filter(|(pid, p)| pid.as_u32() != std::process::id() && p.name().eq_ignore_ascii_case(expected_name))
        .map(|(pid, _)| *pid)
        .collect();
    if pids.is_empty() {
        return Vec::new();
    }
    let mut candidates = System::new();
    candidates.refresh_processes_specifics(
        ProcessesToUpdate::Some(&pids),
        ProcessRefreshKind::new().with_exe(UpdateKind::Always)
            .with_cmd(UpdateKind::Always).with_environ(UpdateKind::Always),
    );
    candidates.processes().values().filter_map(|p| {
        if !p.name().eq_ignore_ascii_case(expected_name)
            || !is_electron_child(p.cmd())
            || is_node_sidecar(p.cmd(), p.environ())
        {
            return None;
        }
        let executable = p.exe();
        let resolved = executable.and_then(|path| path.canonicalize().ok());
        let matches_path = |target: &Path| resolved.as_ref()
            .is_some_and(|actual| actual.as_os_str().eq_ignore_ascii_case(target.as_os_str()));
        if current_exe.as_deref().is_some_and(matches_path) || ide.as_deref().is_some_and(matches_path) {
            return None;
        }
        if let Some(configured) = &app {
            if !matches_path(configured) {
                return None;
            }
        } else if executable.is_some_and(|path| super::is_ide_name(&path.to_string_lossy())) {
            return None;
        }
        let name = p.name().to_string_lossy().to_ascii_lowercase();
        let path = executable.map_or_else(String::new, |path| path.to_string_lossy().to_ascii_lowercase());
        if super::is_switch_process(&path, &name) {
            return None;
        }
        Some(p.pid().as_u32())
    }).collect()
}

fn matching_processes(config: &crate::models::AppConfig) -> Vec<AppProcess> {
    let canonical = |path: Option<&str>| path.and_then(|s| Path::new(s).canonicalize().ok());
    let app = canonical(config.antigravity_executable.as_deref());
    let ide = canonical(config.antigravity_ide_executable.as_deref());
    let expected_name = app.as_deref().and_then(Path::file_name)
        .unwrap_or(OsStr::new("Antigravity.exe"));
    let current_exe = super::get_current_exe_path();

    // 第一遍只列名称。启动参数和 Node 标记只查询同名候选进程。
    let mut names = System::new();
    names.refresh_processes_specifics(ProcessesToUpdate::All, ProcessRefreshKind::new());
    let pids: Vec<_> = names.processes().iter()
        .filter(|(pid, p)| pid.as_u32() != std::process::id() && p.name().eq_ignore_ascii_case(expected_name))
        .map(|(pid, _)| *pid)
        .collect();
    if pids.is_empty() {
        return Vec::new();
    }
    let mut candidates = System::new();
    candidates.refresh_processes_specifics(
        ProcessesToUpdate::Some(&pids),
        ProcessRefreshKind::new().with_exe(UpdateKind::Always)
            .with_cmd(UpdateKind::Always).with_environ(UpdateKind::Always),
    );
    candidates.processes().values().filter_map(|p| {
        if !p.name().eq_ignore_ascii_case(expected_name) || is_helper(p.cmd(), p.environ()) {
            return None;
        }
        let executable = p.exe();
        let resolved = executable.and_then(|path| path.canonicalize().ok());
        let matches_path = |target: &Path| resolved.as_ref()
            .is_some_and(|actual| actual.as_os_str().eq_ignore_ascii_case(target.as_os_str()));
        if current_exe.as_deref().is_some_and(matches_path) || ide.as_deref().is_some_and(matches_path) {
            return None;
        }
        if let Some(configured) = &app {
            if !matches_path(configured) {
                return None;
            }
        } else if executable.is_some_and(|path| super::is_ide_name(&path.to_string_lossy())) {
            return None;
        }
        let name = p.name().to_string_lossy().to_ascii_lowercase();
        let path = executable.map_or_else(String::new, |path| path.to_string_lossy().to_ascii_lowercase());
        if super::is_switch_process(&path, &name) {
            return None;
        }
        Some(AppProcess {
            pid: p.pid().as_u32(),
            executable: executable.map(Path::to_owned),
            args: p.cmd().iter().skip(1).map(|arg| arg.to_string_lossy().into_owned()).collect(),
        })
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distinguishes_the_node_sidecar_and_electron_children_from_a_desktop_launch() {
        let helper = |args: &[&str], env: &[&str]| {
            let argv = std::iter::once("Antigravity.exe").chain(args.iter().copied())
                .map(OsString::from).collect::<Vec<_>>();
            is_helper(&argv, &env.iter().map(OsString::from).collect::<Vec<_>>())
        };
        let loader = r"C:\fixture\node_modules\sidecar_sdk\register_loader.js";
        assert!(helper(&["--import", loader, "main.mjs"], &[]));
        assert!(helper(&["--import=file:///C:/fixture/sidecar_sdk/register_loader.js", "main.mjs"], &[]));
        assert!(helper(&["other.js"], &["electron_run_as_node=1"]));
        assert!(helper(&["--type=renderer"], &[]));
        assert!(!helper(&["--proxy-server=http://localhost:7890", "--hidden"], &[]));
        assert!(!helper(&["--import", "other.js"], &["ELECTRON_RUN_AS_NODE_EXTRA=1"]));
        assert!(!helper(&["--", "--type=renderer", "--import", loader], &[]));
        assert!(is_electron_child(&[OsString::from("Antigravity.exe"), OsString::from("--type=utility")]));
        assert!(!is_node_sidecar(&[OsString::from("Antigravity.exe"), OsString::from("--type=utility")], &[]));
        assert!(is_node_sidecar(&[OsString::from("Antigravity.exe"), OsString::from("--type=utility")], &[OsString::from("ELECTRON_RUN_AS_NODE=1")]));
    }

    #[test]
    fn only_the_main_pid_is_selected_when_the_same_windows_executable_hosts_a_node_worker() {
        use std::process::{Command, Stdio};
        use std::os::windows::process::CommandExt;

        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("Antigravity.exe");
        let system_dir = PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32");
        std::fs::copy(system_dir.join("cmd.exe"), &exe).unwrap();
        let config = crate::models::AppConfig {
            antigravity_executable: Some(exe.to_str().unwrap().to_owned()),
            ..Default::default()
        };
        let spawn = |node: bool| {
            let mut command = Command::new(&exe);
            if node {
                command.env("ELECTRON_RUN_AS_NODE", "1");
            } else {
                command.env_remove("ELECTRON_RUN_AS_NODE");
            }
            command.args(["/D", "/Q"]).creation_flags(0x08000000)
                .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null())
                .spawn().unwrap()
        };
        let mut worker = spawn(true);
        assert!(matching_processes(&config).is_empty());
        let mut desktop = spawn(false);
        let matched = matching_processes(&config);
        assert_eq!(matched.iter().map(|p| p.pid).collect::<Vec<_>>(), [desktop.id()]);
        let detected = matching_processes(&crate::models::AppConfig::default());
        assert!(detected.iter().any(|p| p.pid == desktop.id()));
        assert!(!detected.iter().any(|p| p.pid == worker.id()));
        assert!(worker.try_wait().unwrap().is_none());
        desktop.wait().unwrap();
        assert!(matching_processes(&config).is_empty());
        worker.wait().unwrap();
    }
}
