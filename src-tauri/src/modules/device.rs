use crate::models::DeviceProfile;
use crate::modules::{account, logger, process};
use rand::{distributions::Alphanumeric, Rng};
use rusqlite::Connection;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const GLOBAL_BASELINE: &str = "device_original.json";

#[cfg(test)]
mod repair_tests {
    use super::*;

    #[test]
    fn repair_profile_write_rolls_back_when_database_sync_fails() {
        let dir = tempfile::tempdir().unwrap();
        let storage = dir.path().join("storage.json");
        fs::write(dir.path().join("state.vscdb"), b"not-sqlite").unwrap();
        let original = b"{\"untouched\": true}\n";
        fs::write(&storage, original).unwrap();
        assert!(write_profile(&storage, &generate_profile()).is_err());
        assert_eq!(fs::read(&storage).unwrap(), original);
        fs::remove_file(&storage).unwrap();
        assert!(write_profile(&storage, &generate_profile()).is_err());
        assert!(!storage.exists());
    }

    #[test]
    fn repair_original_backup_captures_storage_once_and_preserves_it() {
        let dir = tempfile::tempdir().unwrap();
        let storage = dir.path().join("storage.json");
        let backup = dir.path().join("original.json");
        let original = generate_profile();
        let storage_value = |profile: &DeviceProfile| serde_json::json!({
            "telemetry.machineId": profile.machine_id,
            "telemetry.macMachineId": profile.mac_machine_id,
            "telemetry.devDeviceId": profile.dev_device_id,
            "telemetry.sqmId": profile.sqm_id,
        });
        fs::write(&storage, storage_value(&original).to_string()).unwrap();
        capture_original_at(&storage, &backup).unwrap();
        let saved = fs::read(&backup).unwrap();
        assert_eq!(serde_json::from_slice::<serde_json::Value>(&saved).unwrap(), serde_json::to_value(&original).unwrap());
        fs::write(&storage, storage_value(&generate_profile()).to_string()).unwrap();
        capture_original_at(&storage, &backup).unwrap();
        assert_eq!(fs::read(&backup).unwrap(), saved);
        fs::write(&backup, b"broken-backup").unwrap();
        assert!(capture_original_at(&storage, &backup).is_err());
        assert_eq!(fs::read(&backup).unwrap(), b"broken-backup");
    }

    #[test]
    fn profile_without_mac_id_reads_flat_and_nested_storage_without_mutation() {
        let dir = tempfile::tempdir().unwrap();
        let storage = dir.path().join("storage.json");
        for value in [
            serde_json::json!({
                "telemetry.machineId": "fixture-machine",
                "telemetry.devDeviceId": "fixture-device",
                "telemetry.sqmId": "fixture-sqm",
            }),
            serde_json::json!({"telemetry": {
                "machineId": "fixture-machine",
                "devDeviceId": "fixture-device",
                "sqmId": "fixture-sqm",
            }}),
        ] {
            let bytes = serde_json::to_vec(&value).unwrap();
            fs::write(&storage, &bytes).unwrap();
            let profile = read_profile(&storage).unwrap();
            assert_eq!(profile.machine_id, "fixture-machine");
            assert_eq!(profile.dev_device_id, "fixture-device");
            assert_eq!(profile.sqm_id, "fixture-sqm");
            assert!(profile.mac_machine_id.is_none());
            assert!(read_profile(&storage).unwrap().mac_machine_id.is_none());
            assert_eq!(fs::read(&storage).unwrap(), bytes);
            let serialized = serde_json::to_value(&profile).unwrap();
            assert!(serialized.get("mac_machine_id").is_none());
            assert!(serde_json::from_value::<DeviceProfile>(serialized).unwrap().mac_machine_id.is_none());
        }
    }

    #[test]
    fn existing_mac_id_and_legacy_profile_remain_compatible() {
        let dir = tempfile::tempdir().unwrap();
        let storage = dir.path().join("storage.json");
        let legacy = serde_json::json!({
            "machine_id": "fixture-machine",
            "mac_machine_id": "fixture-mac",
            "dev_device_id": "fixture-device",
            "sqm_id": "fixture-sqm",
        });
        let profile: DeviceProfile = serde_json::from_value(legacy.clone()).unwrap();
        assert_eq!(serde_json::to_value(&profile).unwrap(), legacy);
        for value in [
            serde_json::json!({
                "telemetry.machineId": "fixture-machine",
                "telemetry.macMachineId": "fixture-mac",
                "telemetry.devDeviceId": "fixture-device",
                "telemetry.sqmId": "fixture-sqm",
            }),
            serde_json::json!({"telemetry": {
                "machineId": "fixture-machine",
                "macMachineId": "fixture-mac",
                "devDeviceId": "fixture-device",
                "sqmId": "fixture-sqm",
            }}),
        ] {
            fs::write(&storage, value.to_string()).unwrap();
            assert_eq!(serde_json::to_value(read_profile(&storage).unwrap()).unwrap(), legacy);
        }
    }

    #[test]
    fn partial_original_backup_restores_absence_after_generated_profile() {
        let dir = tempfile::tempdir().unwrap();
        let storage = dir.path().join("storage.json");
        let backup = dir.path().join("original.json");
        let original = serde_json::json!({
            "telemetry.machineId": "fixture-machine",
            "telemetry.devDeviceId": "fixture-device",
            "telemetry.sqmId": "fixture-sqm",
            "telemetry": {"unrelated": true},
            "unrelated": {"keep": "fixture-value"},
        });
        let original_bytes = serde_json::to_vec(&original).unwrap();
        fs::write(&storage, &original_bytes).unwrap();
        let conn = Connection::open(dir.path().join("state.vscdb")).unwrap();
        conn.execute("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)", []).unwrap();

        capture_original_at(&storage, &backup).unwrap();
        let saved = fs::read(&backup).unwrap();
        let baseline: DeviceProfile = serde_json::from_slice(&saved).unwrap();
        assert!(baseline.mac_machine_id.is_none());
        assert_eq!(fs::read(&storage).unwrap(), original_bytes);

        let generated = generate_profile();
        assert!(generated.mac_machine_id.is_some());
        write_profile(&storage, &generated).unwrap();
        assert_eq!(read_profile(&storage).unwrap().mac_machine_id, generated.mac_machine_id);
        capture_original_at(&storage, &backup).unwrap();
        assert_eq!(fs::read(&backup).unwrap(), saved);

        write_profile(&storage, &baseline).unwrap();
        let restored: Value = serde_json::from_slice(&fs::read(&storage).unwrap()).unwrap();
        assert!(restored.get("telemetry.macMachineId").is_none());
        assert!(restored["telemetry"].get("macMachineId").is_none());
        assert_eq!(restored["unrelated"], original["unrelated"]);
        assert_eq!(restored["telemetry"]["unrelated"], true);
        assert_eq!(serde_json::to_value(read_profile(&storage).unwrap()).unwrap(), serde_json::to_value(baseline).unwrap());
        let service_id: String = conn.query_row(
            "SELECT value FROM ItemTable WHERE key = 'storage.serviceMachineId'", [], |row| row.get(0)
        ).unwrap();
        assert_eq!(service_id, "fixture-device");
    }

    #[test]
    fn incomplete_required_fields_and_corrupt_storage_still_block_backup() {
        let dir = tempfile::tempdir().unwrap();
        let storage = dir.path().join("storage.json");
        let backup = dir.path().join("original.json");
        for (key, expected_error) in [
            ("telemetry.machineId", "missing_machine_id"),
            ("telemetry.devDeviceId", "missing_dev_device_id"),
            ("telemetry.sqmId", "missing_sqm_id"),
        ] {
            let mut value = serde_json::json!({
                "telemetry.machineId": "fixture-machine",
                "telemetry.devDeviceId": "fixture-device",
                "telemetry.sqmId": "fixture-sqm",
            });
            value.as_object_mut().unwrap().remove(key);
            let bytes = serde_json::to_vec(&value).unwrap();
            fs::write(&storage, &bytes).unwrap();
            assert_eq!(capture_original_at(&storage, &backup).unwrap_err(), expected_error);
            assert!(!backup.exists());
            assert_eq!(fs::read(&storage).unwrap(), bytes);
        }
        fs::write(&storage, b"broken-json").unwrap();
        assert!(capture_original_at(&storage, &backup).is_err());
        assert!(!backup.exists());
        assert_eq!(fs::read(&storage).unwrap(), b"broken-json");
    }
}

/// Find storage.json path (prefer custom/portable paths)
pub fn get_storage_path(target_ide: Option<&str>) -> Result<PathBuf, String> {
    // 1) --user-data-dir flag
    if let Some(user_data_dir) = process::get_user_data_dir_from_process(target_ide) {
        let path = user_data_dir
            .join("User")
            .join("globalStorage")
            .join("storage.json");
        if path.exists() {
            return Ok(path);
        }
    }

    // 2) Portable mode (based on executable data/user-data)
    if let Some(exe_path) = process::get_antigravity_executable_path(target_ide) {
        if let Some(parent) = exe_path.parent() {
            let portable = parent
                .join("data")
                .join("user-data")
                .join("User")
                .join("globalStorage")
                .join("storage.json");
            if portable.exists() {
                return Ok(portable);
            }
        }
    }

    let folder_names = super::db::data_folder_names(Some(target_ide.unwrap_or("app")));

    // 3) Standard installation location
    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir().ok_or("failed_to_get_home_dir")?;
        for folder_name in folder_names {
            let path = home.join(format!(
                "Library/Application Support/{}/User/globalStorage/storage.json",
                folder_name
            ));
            if path.exists() {
                return Ok(path);
            }
        }
        for folder_name in folder_names {
            let app_support = home.join(format!("Library/Application Support/{}", folder_name));
            if app_support.exists() {
                return Ok(app_support.join("User/globalStorage/storage.json"));
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let appdata =
            std::env::var("APPDATA").map_err(|_| "failed_to_get_appdata_env".to_string())?;
        for folder_name in folder_names {
            let path = PathBuf::from(&appdata)
                .join(folder_name)
                .join("User\\globalStorage\\storage.json");
            if path.exists() {
                return Ok(path);
            }
        }
        for folder_name in folder_names {
            let app_dir = PathBuf::from(&appdata).join(folder_name);
            if app_dir.exists() {
                return Ok(app_dir.join("User\\globalStorage\\storage.json"));
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let config_home =
            crate::modules::linux_paths::config_home().ok_or("failed_to_get_config_dir")?;
        for folder_name in folder_names {
            let path = config_home
                .join(folder_name)
                .join("User/globalStorage/storage.json");
            if path.exists() {
                return Ok(path);
            }
        }
        for folder_name in folder_names {
            let app_dir = config_home.join(folder_name);
            if app_dir.exists() {
                return Ok(app_dir.join("User/globalStorage/storage.json"));
            }
        }
    }

    Err("storage_json_not_found".to_string())
}

pub fn get_storage_dir() -> Result<PathBuf, String> {
    let path = get_storage_path(None)?;
    path.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "failed_to_get_storage_parent_dir".to_string())
}

pub fn read_profile(storage_path: &Path) -> Result<DeviceProfile, String> {
    let content = fs::read_to_string(storage_path)
        .map_err(|e| format!("read_failed ({:?}): {}", storage_path, e))?;
    let json: Value = serde_json::from_str(&content)
        .map_err(|e| format!("parse_failed ({:?}): {}", storage_path, e))?;

    let get_field = |key: &str| -> Option<String> {
        if let Some(obj) = json.get("telemetry").and_then(|v| v.as_object()) {
            if let Some(v) = obj.get(key).and_then(|v| v.as_str()) {
                return Some(v.to_string());
            }
        }
        if let Some(v) = json
            .get(format!("telemetry.{key}"))
            .and_then(|v| v.as_str())
        {
            return Some(v.to_string());
        }
        None
    };

    Ok(DeviceProfile {
        machine_id: get_field("machineId").ok_or("missing_machine_id")?,
        mac_machine_id: get_field("macMachineId"),
        dev_device_id: get_field("devDeviceId").ok_or("missing_dev_device_id")?,
        sqm_id: get_field("sqmId").ok_or("missing_sqm_id")?,
    })
}

/// Write device profile to storage.json
pub fn write_profile(storage_path: &Path, profile: &DeviceProfile) -> Result<(), String> {
    let original = match fs::read(storage_path) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("read_failed: {error}")),
    };
    let mut json: Value = if let Some(bytes) = &original {
        serde_json::from_slice(bytes).map_err(|e| format!("parse_failed: {}", e))?
    } else {
        if let Some(parent) = storage_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create_storage_directory_failed: {e}"))?;
        }
        serde_json::json!({})
    };

    // Ensure telemetry is an object
    if !json.get("telemetry").map_or(false, |v| v.is_object()) {
        if json.as_object_mut().is_some() {
            json["telemetry"] = serde_json::json!({});
        } else {
            return Err("json_top_level_not_object".to_string());
        }
    }

    if let Some(telemetry) = json.get_mut("telemetry").and_then(|v| v.as_object_mut()) {
        telemetry.insert(
            "machineId".to_string(),
            Value::String(profile.machine_id.clone()),
        );
        if let Some(mac_machine_id) = &profile.mac_machine_id {
            telemetry.insert("macMachineId".to_string(), Value::String(mac_machine_id.clone()));
        } else {
            // 恢复缺省指纹时清除后来写入的值，不能留下新指纹或空字符串。
            telemetry.remove("macMachineId");
        }
        telemetry.insert(
            "devDeviceId".to_string(),
            Value::String(profile.dev_device_id.clone()),
        );
        telemetry.insert("sqmId".to_string(), Value::String(profile.sqm_id.clone()));
    } else {
        return Err("telemetry_not_object".to_string());
    }

    // Write flat keys as well, compatible with old formats
    if let Some(map) = json.as_object_mut() {
        map.insert(
            "telemetry.machineId".to_string(),
            Value::String(profile.machine_id.clone()),
        );
        if let Some(mac_machine_id) = &profile.mac_machine_id {
            map.insert("telemetry.macMachineId".to_string(), Value::String(mac_machine_id.clone()));
        } else {
            map.remove("telemetry.macMachineId");
        }
        map.insert(
            "telemetry.devDeviceId".to_string(),
            Value::String(profile.dev_device_id.clone()),
        );
        map.insert(
            "telemetry.sqmId".to_string(),
            Value::String(profile.sqm_id.clone()),
        );
        map.insert(
            "storage.serviceMachineId".to_string(),
            Value::String(profile.dev_device_id.clone()),
        );
    }

    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| format!("serialize_failed: {}", e))?;
    crate::utils::fs::write_atomic(storage_path, updated.as_bytes())
        .map_err(|e| format!("write_failed ({:?}): {}", storage_path, e))?;
    // 数据库写入失败时恢复原始 JSON，避免两份指纹不一致却继续切换。
    if let Err(error) = sync_state_service_machine_id_value(storage_path, &profile.dev_device_id) {
        let restored = match original {
            Some(bytes) => crate::utils::fs::write_atomic(storage_path, &bytes),
            None => fs::remove_file(storage_path).map_err(|e| e.to_string()),
        };
        return Err(match restored {
            Ok(()) => error,
            Err(restore_error) => format!("{error}; storage rollback failed: {restore_error}"),
        });
    }
    logger::log_info(&format!("device_profile_written to {:?}", storage_path));
    Ok(())
}

fn sync_state_service_machine_id_value(storage_path: &Path, service_id: &str) -> Result<(), String> {
    let db_path = storage_path
        .parent()
        .ok_or("failed_to_get_storage_parent_dir")?
        .join("state.vscdb");
    if !db_path.exists() {
        logger::log_warn(&format!("state_db_missing: {:?}", db_path));
        return Ok(());
    }

    let conn = Connection::open(&db_path).map_err(|e| format!("db_open_failed: {}", e))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT);",
        [],
    )
    .map_err(|e| format!("failed_to_create_item_table: {}", e))?;
    conn.execute(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('storage.serviceMachineId', ?1);",
        [service_id],
    )
    .map_err(|e| format!("failed_to_write_to_db: {}", e))?;
    logger::log_info("service_machine_id_synced_to_db");
    Ok(())
}

/// Load global baseline original device profile
pub fn load_global_original() -> Option<DeviceProfile> {
    if let Ok(dir) = account::get_data_dir() {
        let path = dir.join(GLOBAL_BASELINE);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(profile) = serde_json::from_str::<DeviceProfile>(&content) {
                    return Some(profile);
                }
            }
        }
    }
    None
}

pub fn capture_global_original() -> Result<(), String> {
    let dir = account::get_data_dir()?;
    let path = dir.join(GLOBAL_BASELINE);
    if path.exists() { return validate_original_at(&path); }
    capture_original_at(&get_storage_path(None)?, &path)
}

pub(crate) fn capture_original_from_storage(storage: &Path) -> Result<(), String> {
    capture_original_at(storage, &account::get_data_dir()?.join(GLOBAL_BASELINE))
}

fn validate_original_at(path: &Path) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|e| format!("Cannot read original device backup: {e}"))?;
    serde_json::from_slice::<DeviceProfile>(&bytes).map(|_| ())
        .map_err(|_| "Original device backup is invalid; restore a valid backup before continuing.".into())
}

fn capture_original_at(storage: &Path, backup: &Path) -> Result<(), String> {
    if backup.exists() { return validate_original_at(backup); }
    let original = read_profile(storage)?;
    save_original_at(backup, &original)
}

/// 首份真实指纹只创建一次，临时文件写完后再提交，避免中断留下半份备份。
fn save_original_at(path: &Path, profile: &DeviceProfile) -> Result<(), String> {
    if path.exists() {
        return validate_original_at(path);
    }
    let parent = path.parent().ok_or("Original backup directory is unavailable.")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(profile).map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut temporary, &bytes).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    match temporary.persist_noclobber(path) {
        Ok(_) => Ok(()),
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
            let bytes = fs::read(path).map_err(|e| e.to_string())?;
            serde_json::from_slice::<DeviceProfile>(&bytes).map(|_| ()).map_err(|e| e.to_string())
        }
        Err(error) => Err(format!("Cannot save original device backup: {}", error.error)),
    }
}

/// Generate a new set of device fingerprints (Cursor/VSCode style)
pub fn generate_profile() -> DeviceProfile {
    DeviceProfile {
        machine_id: format!("auth0|user_{}", random_hex(32)),
        mac_machine_id: Some(new_standard_machine_id()),
        dev_device_id: Uuid::new_v4().to_string(),
        sqm_id: format!("{{{}}}", Uuid::new_v4().to_string().to_uppercase()),
    }
}

fn random_hex(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect::<String>()
        .to_lowercase()
}

fn new_standard_machine_id() -> String {
    let mut rng = rand::thread_rng();
    let mut id = String::with_capacity(36);
    for ch in "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".chars() {
        if ch == '-' || ch == '4' {
            id.push(ch);
        } else if ch == 'x' {
            id.push_str(&format!("{:x}", rng.gen_range(0..16)));
        } else if ch == 'y' {
            id.push_str(&format!("{:x}", rng.gen_range(8..12)));
        }
    }
    id
}
