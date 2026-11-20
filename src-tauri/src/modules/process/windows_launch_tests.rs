use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const FIXTURE: &str = "AGYFLUX_WINDOWS_LAUNCH_FIXTURE";
const RUNNER: &str = "modules::process::windows_launch_tests::launch_from_captured_manager";
const CLIENT: &str = "modules::process::windows_launch_tests::write_after_manager_exits";

#[test]
fn windows_client_logs_survive_the_end_of_manager_output_capture() {
    for mode in ["desktop", "cli"] {
        let directory = tempfile::tempdir().unwrap();
        let mut launcher = Command::new(std::env::current_exe().unwrap())
            .args(["--ignored", "--exact", RUNNER])
            .env(FIXTURE, directory.path())
            .env("AGYFLUX_WINDOWS_FIXTURE_MODE", mode)
            .env("ABV_DATA_DIR", directory.path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        assert!(launcher.wait().unwrap().success(), "{mode}");
        drop(launcher);
        // 日志读端已经关闭，再让子进程写入，以复现 Windows 上的 EPIPE 条件。
        fs::write(directory.path().join("capture-closed"), []).unwrap();
        let receipt = directory.path().join("stdio-result");
        wait_for_path(&receipt);
        assert_eq!(fs::read_to_string(receipt).unwrap(), "2,2,2;true,true", "{mode}");
    }
}

#[test]
#[ignore = "由标准输出隔离测试启动"]
fn launch_from_captured_manager() {
    let directory = fixture_dir();
    let client = directory.join("fixture-client.exe");
    fs::copy(std::env::current_exe().unwrap(), &client).unwrap();
    let config = crate::models::AppConfig {
        antigravity_executable: Some(client.to_str().unwrap().into()),
        antigravity_args: Some(["--ignored", "--exact", CLIENT].map(String::from).to_vec()),
        ..Default::default()
    };
    fs::write(directory.join("gui_config.json"), serde_json::to_vec(&config).unwrap()).unwrap();
    if std::env::var("AGYFLUX_WINDOWS_FIXTURE_MODE").as_deref() == Ok("cli") {
        super::start_antigravity_detached(Some("app")).unwrap();
    } else {
        super::start_antigravity(Some("app")).unwrap();
    }
}

#[test]
#[ignore = "由标准输出隔离测试启动"]
fn write_after_manager_exits() {
    use std::io::Write;
    use windows_sys::Win32::Storage::FileSystem::GetFileType;
    use windows_sys::Win32::Foundation::HANDLE;

    #[link(name = "Kernel32")]
    extern "system" {
        fn GetStdHandle(kind: u32) -> HANDLE;
    }

    let directory = fixture_dir();
    let [input, output, error] = [-10_i32, -11, -12]
        .map(|kind| unsafe { GetFileType(GetStdHandle(kind as u32)) });
    wait_for_path(&directory.join("capture-closed"));
    let wrote_output = std::io::stdout().lock().write_all(b"after capture\n").is_ok();
    let wrote_error = std::io::stderr().lock().write_all(b"after capture\n").is_ok();
    let raw_receipt = directory.join("writing-result");
    fs::write(&raw_receipt, format!("{input},{output},{error};{wrote_output},{wrote_error}")).unwrap();
    fs::rename(raw_receipt, directory.join("stdio-result")).unwrap();
}

fn fixture_dir() -> PathBuf {
    let folder = PathBuf::from(std::env::var_os(FIXTURE).expect("缺少测试工作目录"));
    assert_eq!(std::env::var_os("ABV_DATA_DIR").as_deref(), Some(folder.as_os_str()));
    folder
}

fn wait_for_path(path: &Path) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !path.is_file() {
        assert!(Instant::now() < deadline, "等待测试进程超时");
        std::thread::sleep(Duration::from_millis(20));
    }
}
