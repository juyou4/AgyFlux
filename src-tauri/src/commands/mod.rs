use crate::models::{Account, AccountView, AppConfig, QuotaData};
use crate::modules;
use tauri::Emitter;

/// 列出所有账号
#[tauri::command]
pub async fn list_accounts() -> Result<Vec<AccountView>, String> {
    tokio::task::spawn_blocking(modules::list_accounts)
        .await
        .unwrap_or_else(|_| Err("Task panicked".to_string()))
        .map(|accounts| accounts.into_iter().map(AccountView::from).collect())
}

/// Read-only, credential-free account dashboard with explicit index/read counts.
#[tauri::command]
pub async fn get_account_dashboard_snapshot(
) -> Result<modules::account_dashboard::DashboardSnapshot, String> {
    tokio::task::spawn_blocking(modules::account_dashboard::snapshot)
        .await
        .map_err(|_| "dashboard_task_failed".to_string())?
}

/// Resolve the running App identity without exposing credentials or selecting
/// the first saved account when identity discovery fails.
#[tauri::command]
pub async fn get_menu_bar_snapshot(
) -> Result<modules::account_dashboard::DashboardSnapshot, String> {
    tokio::task::spawn_blocking(|| {
        #[allow(unused_mut)]
        let mut snapshot = modules::account_dashboard::snapshot()?;
        #[cfg(target_os = "macos")]
        {
            let config = modules::load_app_config()?;
            modules::account_dashboard::apply_running_identity(&mut snapshot,
                modules::app_identity::running_email(config.antigravity_executable.as_deref()));
        }
        Ok(snapshot)
    }).await.map_err(|_| "dashboard_task_failed".to_string())?
}

#[tauri::command]
pub async fn set_menu_bar_preferences(
    app: tauri::AppHandle,
    quota_scope: Option<crate::models::config::MenuBarQuotaScope>,
    patch: Option<crate::models::config::MenuBarPreferencesPatch>,
) -> Result<crate::models::config::MenuBarPreferences, String> {
    let mut patch = patch.unwrap_or_default();
    if let Some(scope) = quota_scope { patch.quota_scope = Some(scope); }
    let preferences = tokio::task::spawn_blocking(move || modules::config::set_menu_bar_preferences(patch))
        .await.map_err(|_| "settings_task_failed".to_string())??;
    app.emit("menubar://preferences-updated", &preferences).map_err(|e| e.to_string())?;
    app.emit("config://updated", ()).map_err(|e| e.to_string())?;
    Ok(preferences)
}

/// Save dashboard card selection and order without overwriting other settings.
#[tauri::command]
pub async fn set_dashboard_cards(cards: Vec<String>, order: Option<Vec<String>>) -> Result<crate::models::config::DashboardPreferences, String> {
    tokio::task::spawn_blocking(move || modules::config::set_dashboard_cards(cards, order))
        .await.map_err(|error| error.to_string())?
}

/// 添加账号
#[tauri::command]
pub async fn add_account(
    app: tauri::AppHandle,
    _email: String,
    refresh_token: String,
) -> Result<AccountView, String> {
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::new(app.clone()),
    );

    let account = service.add_account(&refresh_token).await?;
    crate::modules::tray::update_tray_menus(&app);
    let _ = app.emit("menubar://data-updated", ());

    Ok(account.into())
}

/// 删除账号
#[tauri::command]
pub async fn delete_account(app: tauri::AppHandle, account_id: String) -> Result<(), String> {
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::new(app.clone()),
    );
    service.delete_account(&account_id)?;
    let _ = app.emit("menubar://data-updated", ());

    Ok(())
}

/// 批量删除账号
#[tauri::command]
pub async fn delete_accounts(
    app: tauri::AppHandle,
    account_ids: Vec<String>,
) -> Result<(), String> {
    modules::logger::log_info(&format!(
        "收到批量删除请求，共 {} 个账号",
        account_ids.len()
    ));
    modules::account::delete_accounts(&account_ids).map_err(|e| {
        modules::logger::log_error(&format!("批量删除失败: {}", e));
        e
    })?;

    // 强制同步托盘与快捷面板
    crate::modules::tray::update_tray_menus(&app);
    let _ = app.emit("menubar://data-updated", ());

    Ok(())
}

/// 重新排序账号列表
/// 根据传入的账号ID数组顺序更新账号排列
#[tauri::command]
pub async fn reorder_accounts(app: tauri::AppHandle, account_ids: Vec<String>) -> Result<(), String> {
    modules::logger::log_info(&format!(
        "收到账号重排序请求，共 {} 个账号",
        account_ids.len()
    ));
    modules::account::reorder_accounts(&account_ids).map_err(|e| {
        modules::logger::log_error(&format!("账号重排序失败: {}", e));
        e
    })?;
    let _ = app.emit("menubar://data-updated", ());

    Ok(())
}

/// 切换账号
#[tauri::command]
pub async fn switch_account(
    app: tauri::AppHandle,
    account_id: String,
    target_ide: Option<String>,
) -> Result<(), String> {
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::new(app.clone()),
    );

    service
        .switch_account(&account_id, target_ide.as_deref())
        .await?;

    // 同步托盘并通知快捷面板与主窗口刷新当前生效账号
    crate::modules::tray::update_tray_menus(&app);
    let _ = app.emit("menubar://data-updated", ());
    let _ = app.emit("tray://account-switched", &account_id);

    Ok(())
}

/// 获取当前账号
#[tauri::command]
pub async fn get_current_account(target_ide: Option<String>) -> Result<Option<AccountView>, String> {
    // println!("🚀 Backend Command: get_current_account called"); // Commented out to reduce noise for frequent calls, relies on frontend log for frequency
    // Actually user WANTS to see it.
    modules::logger::log_info("Backend Command: get_current_account called");

    let account_id = modules::account::get_current_account_id_for_target(target_ide.as_deref())?;

    if let Some(id) = account_id {
        // modules::logger::log_info(&format!("   Found current account ID: {}", id));
        modules::load_account(&id).map(|account| Some(account.into()))
    } else {
        modules::logger::log_info("   No current account set");
        Ok(None)
    }
}

/// 导出账号（包含 refresh_token）
use crate::models::AccountExportResponse;

#[tauri::command]
pub async fn export_accounts(account_ids: Vec<String>) -> Result<AccountExportResponse, String> {
    tokio::task::spawn_blocking(move || modules::account::export_accounts_by_ids(&account_ids))
        .await
        .unwrap_or_else(|_| Err("Task panicked".to_string()))
}

#[tauri::command]
pub async fn save_account_export(account_ids: Vec<String>, path: String) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || modules::account::save_account_export(&account_ids, std::path::Path::new(&path)))
        .await.map_err(|_| "Account export worker failed.".to_string())?
}

async fn import_account_transfer_item(
    app: &tauri::AppHandle,
    item: crate::models::AccountExportItem,
) -> Result<Account, String> {
    let response = modules::oauth::refresh_access_token_with_client(
        &item.refresh_token,
        None,
        item.oauth_client_key.as_deref(),
    )
    .await?;
    let user = modules::oauth::get_user_info(&response.access_token).await?;
    if user.email.trim().is_empty()
        || (!item.email.is_empty() && !item.email.eq_ignore_ascii_case(&user.email))
    {
        return Err("The imported credentials do not match the exported account identity.".into());
    }
    let token = crate::models::TokenData::new(
        response.access_token,
        item.refresh_token,
        response.expires_in,
        Some(user.email.clone()),
        item.project_id,
        None,
        item.is_gcp_tos,
        response.id_token,
    )
    .with_oauth_client_key(response.oauth_client_key);
    let mut account = modules::account::upsert_account(user.email, item.name.or(user.name), token)?;
    if let Some(label) = item.custom_label {
        let _write = modules::account::lock_account_file_updates()?;
        account = modules::account::load_account(&account.id)?;
        account.custom_label = Some(label);
        modules::account::save_account(&account)?;
    }
    let _ = internal_refresh_account_quota(app, &mut account).await;
    Ok(account)
}

fn parse_export_items_from_json(
    text: &str,
) -> Result<Vec<crate::models::AccountExportItem>, String> {
    let trimmed = text.trim_start_matches('\u{feff}').trim();
    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|_| "Invalid account export file format.".to_string())?;
    let items = if value.get("accounts").is_some() {
        let resp: crate::models::AccountExportResponse = serde_json::from_value(value)
            .map_err(|_| "Invalid account export file format.".to_string())?;
        if resp.schema_version != 0 && !matches!(resp.schema_version, 1 | 2) {
            return Err("Unsupported account export schema version.".into());
        }
        resp.accounts
    } else if value.is_array() {
        serde_json::from_value(value).map_err(|_| "Invalid account export file format.".to_string())?
    } else {
        vec![serde_json::from_value(value).map_err(|_| "Invalid account export file format.".to_string())?]
    };
    if items.is_empty() || items.iter().any(|item| {
        !item.refresh_token.starts_with("1//") || item.refresh_token.len() <= 3 ||
        !item.refresh_token[3..].bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
    }) {
        return Err("Invalid account export file format.".into());
    }
    let mut seen = std::collections::HashSet::new();
    Ok(items.into_iter().filter(|item| seen.insert(item.refresh_token.clone())).collect())
}

#[tauri::command]
pub async fn import_account_transfer(
    app: tauri::AppHandle,
    item: crate::models::AccountExportItem,
) -> Result<AccountView, String> {
    let view = import_account_transfer_item(&app, item).await.map(AccountView::from)?;
    let _ = app.emit("menubar://data-updated", ());
    Ok(view)
}

/// 内部辅助功能：在添加或导入账号后自动刷新一次额度
async fn internal_refresh_account_quota(
    app: &tauri::AppHandle,
    account: &mut Account,
) -> Result<QuotaData, String> {
    modules::logger::log_info(&format!("自动触发刷新配额: {}", account.email));

    // 使用带重试的查询 (Shared logic)
    match modules::account::fetch_quota_with_retry(account).await {
        Ok(quota) => {
            // 更新账号配额
            let _ = modules::update_account_quota(&account.id, quota.clone());
            account.update_quota(quota.clone());
            // 更新托盘菜单
            crate::modules::tray::update_tray_menus(app);
            let _ = app.emit("accounts://refreshed", ());
            Ok(quota)
        }
        Err(e) => {
            modules::logger::log_warn(&format!("自动刷新配额失败 ({}): {}", account.email, e));
            Err(e.to_string())
        }
    }
}

/// 查询账号配额
#[tauri::command]
pub async fn fetch_account_quota(
    app: tauri::AppHandle,
    account_id: String,
) -> crate::error::AppResult<QuotaData> {
    modules::logger::log_info(&format!("手动刷新配额请求: {}", account_id));
    let mut account =
        modules::load_account(&account_id).map_err(crate::error::AppError::Account)?;

    // 使用带重试的查询 (Shared logic)
    let quota = modules::account::fetch_quota_with_retry(&mut account).await?;

    // 4. 更新账号配额
    modules::update_account_quota(&account_id, quota.clone())
        .map_err(crate::error::AppError::Account)?;

    crate::modules::tray::update_tray_menus(&app);

    Ok(quota)
}

pub use modules::account::RefreshStats;

/// 刷新所有账号配额 (内部实现)
pub async fn refresh_all_quotas_internal(
    app_handle: Option<tauri::AppHandle>,
) -> Result<RefreshStats, String> {
    let stats = modules::account::refresh_all_quotas_logic().await?;

    // 同步系统托盘菜单并通知主窗口与快捷面板刷新
    if let Some(handle) = app_handle {
        use tauri::Emitter;
        crate::modules::tray::update_tray_menus(&handle);
        let _ = handle.emit("accounts://refreshed", ());
        let _ = handle.emit("menubar://data-updated", ());
    }

    Ok(stats)
}

/// 刷新所有账号配额 (Tauri Command)
#[tauri::command]
pub async fn refresh_all_quotas(app_handle: tauri::AppHandle) -> Result<RefreshStats, String> {
    refresh_all_quotas_internal(Some(app_handle)).await
}
/// 加载配置
#[tauri::command]
pub async fn load_config() -> Result<AppConfig, String> {
    modules::load_app_config()
}

/// 保存配置
#[tauri::command]
pub async fn save_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    // Ordinary saves preserve dedicated desktop preferences under
    // the same configuration lock, including stale snapshots from other windows.
    modules::save_app_config(&config)?;
    crate::utils::http::invalidate_clients();
    let _ = app.emit("config://updated", ());
    Ok(())
}

// --- OAuth 命令 ---

#[tauri::command]
pub async fn start_oauth_login(
    app_handle: tauri::AppHandle,
    oauth_client_key: Option<String>,
) -> Result<AccountView, String> {
    modules::logger::log_info("开始 OAuth 授权流程...");
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::new(app_handle.clone()),
    );

    let mut account = service.start_oauth_login(oauth_client_key).await?;
    let _ = internal_refresh_account_quota(&app_handle, &mut account).await;
    Ok(account.into())
}

/// 完成 OAuth 授权（不自动打开浏览器）
#[tauri::command]
pub async fn complete_oauth_login(app_handle: tauri::AppHandle) -> Result<AccountView, String> {
    modules::logger::log_info("完成 OAuth 授权流程 (manual)...");
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::new(app_handle.clone()),
    );

    let mut account = service.complete_oauth_login().await?;
    let _ = internal_refresh_account_quota(&app_handle, &mut account).await;
    Ok(account.into())
}

/// 预生成 OAuth 授权链接 (不打开浏览器)
#[tauri::command]
pub async fn prepare_oauth_url(
    app_handle: tauri::AppHandle,
    oauth_client_key: Option<String>,
) -> Result<String, String> {
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::new(app_handle.clone()),
    );
    service.prepare_oauth_url(oauth_client_key).await
}

#[tauri::command]
pub async fn cancel_oauth_login(flow_id: Option<String>) -> Result<bool, String> {
    modules::oauth_server::cancel_login(flow_id.as_deref())
}

#[tauri::command]
pub async fn prepare_oauth_login(app: tauri::AppHandle) -> Result<modules::oauth_server::OAuthLoginSession, String> {
    modules::oauth_server::prepare_login(Some(app)).await
}

#[tauri::command]
pub async fn open_oauth_login(app: tauri::AppHandle, flow_id: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = modules::oauth_server::login_url(&flow_id)?;
    app.opener().open_url(url, None::<&str>).map_err(|_| "Cannot open the browser. Copy the login link and open it manually.".into())
}

#[tauri::command]
pub async fn finish_oauth_login(app: tauri::AppHandle, flow_id: String) -> Result<AccountView, String> {
    let service = modules::account_service::AccountService::new(modules::integration::SystemManager::new(app.clone()));
    let account = service.finish_prepared_login(&flow_id).await?;
    crate::modules::tray::update_tray_menus(&app);
    let _ = app.emit("menubar://data-updated", ());
    let mut refreshed = account.clone();
    // 账号保存成功即可返回；初始配额在后台获取，避免将网络等待混入已完成的登录。
    tauri::async_runtime::spawn(async move {
        let _ = internal_refresh_account_quota(&app, &mut refreshed).await;
    });
    Ok(account.into())
}

/// 手动提交 OAuth Code (用于远程环境无法自动回调时)
#[tauri::command]
pub async fn submit_oauth_code(code: String, state: Option<String>, flow_id: Option<String>) -> Result<(), String> {
    modules::logger::log_info("收到手动提交 OAuth Code 请求");
    modules::oauth_server::submit_oauth_code(code, state, flow_id).await
}

#[tauri::command]
pub async fn list_oauth_clients(
) -> Result<Vec<crate::modules::oauth::OAuthClientDescriptor>, String> {
    crate::modules::oauth::list_oauth_clients()
}

#[tauri::command]
pub async fn get_active_oauth_client() -> Result<String, String> {
    crate::modules::oauth::get_active_oauth_client_key()
}

#[tauri::command]
pub async fn set_active_oauth_client(client_key: String) -> Result<(), String> {
    crate::modules::oauth::set_active_oauth_client_key(&client_key)
}

// --- 导入命令 ---

#[derive(serde::Serialize)]
pub struct LocalImportView {
    accounts: Vec<AccountView>,
    sources: Vec<modules::migration::LocalImportSource>,
}

#[tauri::command]
pub async fn import_local_accounts_report(app: tauri::AppHandle) -> Result<LocalImportView, String> {
    let _guard = crate::cli::SwitchLock::acquire(&modules::account::get_data_dir()?)?;
    let identities = tokio::task::spawn_blocking(|| ["app", "ide"].map(|target| (target, modules::migration::get_current_identity(Some(target)))))
        .await.map_err(|_| "Local identity discovery failed.".to_string())?;
    let report = modules::migration::import_local_accounts_report(None).await?;
    for (target, identity) in identities {
        if let Ok(identity) = identity {
            if let Some(account) = report.accounts.iter().find(|account| identity.matches(account)) {
                modules::account::set_current_account_id_with_target(&account.id, Some(target))?;
            }
        }
    }
    for mut account in report.accounts.clone() { let _ = internal_refresh_account_quota(&app, &mut account).await; }
    crate::modules::tray::update_tray_menus(&app);
    let _ = app.emit("menubar://data-updated", ());
    Ok(LocalImportView { accounts: report.accounts.into_iter().map(AccountView::from).collect(), sources: report.sources })
}

#[tauri::command]
pub async fn import_from_db(
    app: tauri::AppHandle,
    target_ide: Option<String>,
) -> Result<Vec<AccountView>, String> {
    let _switch_guard = crate::cli::SwitchLock::acquire(&modules::account::get_data_dir()?)?;
    let target = target_ide.clone();
    let identity = tokio::task::spawn_blocking(move || {
        modules::migration::get_current_identity(target.as_deref())
    })
    .await
    .map_err(|_| "current_identity_task_failed".to_string())?;
    let imported_accounts =
        modules::migration::import_all_local_accounts(target_ide.as_deref()).await?;

    if let Ok(identity) = identity {
        if let Some(active) = imported_accounts.iter().find(|account| identity.matches(account)) {
            modules::account::set_current_account_id_with_target(
                &active.id,
                target_ide.as_deref(),
            )?;
        }
    }

    for mut account in imported_accounts.clone() {
        let _ = internal_refresh_account_quota(&app, &mut account).await;
    }

    crate::modules::tray::update_tray_menus(&app);
    let _ = app.emit("menubar://data-updated", ());

    Ok(imported_accounts.into_iter().map(AccountView::from).collect())
}

#[tauri::command]
pub async fn import_custom_db(app: tauri::AppHandle, path: String) -> Result<AccountFileImportReport, String> {
    let path_ref = std::path::Path::new(&path);
    let is_json_ext = path_ref
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"));
    let json_text = std::fs::read_to_string(path_ref).ok().filter(|text| {
        let trimmed = text.trim_start_matches('\u{feff}').trim_start();
        is_json_ext || trimmed.starts_with('{') || trimmed.starts_with('[')
    });

    if let Some(text) = json_text {
        let items = parse_export_items_from_json(&text)?;
        let mut report = AccountFileImportReport { imported: 0, failed: 0 };
        for item in items {
            match import_account_transfer_item(&app, item).await {
                Ok(_) => report.imported += 1,
                Err(_) => report.failed += 1,
            }
        }
        crate::modules::tray::update_tray_menus(&app);
        let _ = app.emit("accounts://refreshed", ());
        let _ = app.emit("menubar://data-updated", ());
        return Ok(report);
    }
    if is_json_ext { return Err("Cannot read account export file.".into()); }

    // 调用重构后的自定义导入函数
    let mut account = modules::migration::import_from_custom_db_path(path).await?;

    // 自动触发刷新额度
    let _ = internal_refresh_account_quota(&app, &mut account).await;

    // 刷新托盘图标展示
    crate::modules::tray::update_tray_menus(&app);
    let _ = app.emit("menubar://data-updated", ());

    Ok(AccountFileImportReport { imported: 1, failed: 0 })
}

#[derive(serde::Serialize)]
pub struct AccountFileImportReport {
    imported: usize,
    failed: usize,
}

#[tauri::command]
pub async fn sync_account_from_db(app: tauri::AppHandle) -> Result<Option<AccountView>, String> {
    modules::account_sync::synchronize(app).await.map(|account| account.map(AccountView::from))
}

/// 按概览页的请求同步本机 App 登录，供账号库重新识别。
#[tauri::command]
pub async fn reconcile_app_sign_in(app: tauri::AppHandle) -> Result<(), String> {
    {
        let _guard = crate::cli::SwitchLock::acquire(&modules::account::get_data_dir()?)?;
        modules::migration::reconcile_app_sign_in().await?;
    }
    modules::tray::update_tray_menus(&app);
    let _ = app.emit("menubar://data-updated", ());
    Ok(())
}

pub(crate) async fn sync_account_from_db_internal(app: tauri::AppHandle) -> Result<Option<Account>, String> {
    // Serialize the observation and index update with real credential switches.
    let _switch_guard = crate::cli::SwitchLock::acquire(&modules::account::get_data_dir()?)?;
    // Check if the current target is one we should not sync (like agy CLI)
    let index = modules::account::load_account_index()?;
    let current_target = index.current_target_ide.as_deref();
    if current_target == Some("agy") {
        modules::logger::log_info("Auto-sync skipped: current target is agy CLI");
        return Ok(None);
    }

    let target = Some("app".to_string());
    let identity = tokio::task::spawn_blocking(move || {
        modules::migration::get_current_identity(target.as_deref())
    })
    .await
    .map_err(|_| "current_identity_task_failed".to_string())??;
    let current = modules::account::get_current_account()?;
    if current.as_ref().is_some_and(|account| identity.matches(account)) {
        return Ok(None);
    }
    let from_live_app = matches!(&identity, modules::migration::CurrentIdentity::AppEmail(_));
    let mut account = match identity {
        modules::migration::CurrentIdentity::AppEmail(email) => {
            let mut matches = index
                .accounts
                .iter()
                .filter(|account| account.email.eq_ignore_ascii_case(&email));
            let active = matches.next().ok_or("running_app_account_not_imported")?;
            if matches.next().is_some() {
                return Err("running_app_account_ambiguous".into());
            }
            modules::account::load_account(&active.id)?
        }
        modules::migration::CurrentIdentity::Credentials(state) => {
            modules::migration::import_observed_oauth_state(state).await?
        }
    };

    // 既然是从数据库导入，自动将其设为 Manager 的当前账号并保留当前 target
    let account_id = account.id.clone();
    modules::account::set_current_account_id_with_target(&account_id, Some("app"))?;
    modules::account_usage::record_active_account(&account_id, chrono::Utc::now().timestamp());
    tracing::info!(
        previous_account_id = current.as_ref().map(|account| account.id.as_str()).unwrap_or("none"),
        current_account_id = account_id.as_str(),
        observation = if from_live_app { "running_app" } else { "observed_credential" },
        "Current account record synchronized; client credentials unchanged"
    );

    // 自动触发刷新额度
    let _ = internal_refresh_account_quota(&app, &mut account).await;

    // 刷新托盘图标展示
    crate::modules::tray::update_tray_menus(&app);
    let _ = app.emit("accounts://refreshed", ());

    Ok(Some(account))
}

/// 打开数据目录
#[tauri::command]
pub async fn open_data_folder() -> Result<(), String> {
    let path = modules::account::get_data_dir()?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        use crate::utils::command::CommandExtWrapper;
        std::process::Command::new("explorer")
            .creation_flags_windows()
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    Ok(())
}

/// 获取数据目录绝对路径
#[tauri::command]
pub async fn get_data_dir_path() -> Result<String, String> {
    let path = modules::account::get_data_dir()?;
    Ok(path.to_string_lossy().to_string())
}

/// 显示主窗口
#[tauri::command]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    modules::desktop::show_main(&app)
}

/// 设置窗口主题（用于同步 Windows 标题栏按钮颜色）
#[tauri::command]
pub async fn set_window_theme(window: tauri::Window, theme: String) -> Result<(), String> {
    use tauri::Theme;

    let tauri_theme = match theme.as_str() {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        _ => None, // system default
    };

    window.set_theme(tauri_theme).map_err(|e| e.to_string())
}

/// 更新账号自定义标签
#[tauri::command]
pub async fn update_account_label(account_id: String, label: String) -> Result<(), String> {
    // 验证标签长度（按字符数计算，支持中文）
    if label.chars().count() > 15 {
        return Err("Label must be 15 characters or fewer.".into());
    }

    modules::logger::log_info(&format!(
        "更新账号标签: {} -> {:?}",
        account_id,
        if label.is_empty() { "无" } else { &label }
    ));

    // 与配额刷新、切换、导入等写入方共用同一把账号文件锁，避免并发写竞争与半写入损坏。
    let _write = modules::account::lock_account_file_updates()?;
    let mut account = modules::account::load_account(&account_id)?;
    account.custom_label = if label.is_empty() {
        None
    } else {
        Some(label.clone())
    };
    modules::account::save_account(&account)?;

    Ok(())
}

/// 读取 Antigravity 原生对话数据库中的本地 Token 用量
#[tauri::command]
pub async fn get_local_token_usage(
) -> Result<crate::modules::native_token_stats::LocalTokenUsageSummary, String> {
    let summary = tokio::task::spawn_blocking(crate::modules::native_token_stats::get_local_token_usage)
        .await
        .map_err(|error| format!("读取本地 Token 统计任务失败: {}", error))??;
    crate::modules::menu_bar_usage::remember(&summary);
    Ok(summary)
}

/// Compact local daily usage for the tray, without a network pricing request.
#[tauri::command]
pub async fn get_menu_bar_usage() -> Result<crate::modules::menu_bar_usage::MenuBarUsage, String> {
    crate::modules::menu_bar_usage::load().await
}

/// 同步 Google 官方 API 价格，用于本地费用等价估算
#[tauri::command]
pub async fn get_api_pricing() -> Result<crate::modules::api_pricing::ApiPricingSnapshot, String> {
    crate::modules::api_pricing::get_api_pricing().await
}

/// 检查 GitHub Releases 获取最新版本信息
#[tauri::command]
pub async fn check_for_updates() -> Result<crate::modules::updater::UpdateInfo, String> {
    crate::modules::updater::check_for_updates().await
}

#[tauri::command]
pub fn get_running_version() -> String { env!("CARGO_PKG_VERSION").into() }

#[tauri::command]
pub async fn download_and_install_update(app: tauri::AppHandle, expected_version: String, progress: tauri::ipc::Channel<crate::modules::updater::UpdateProgress>) -> Result<(), String> {
    crate::modules::updater::download_and_install(app, expected_version, progress).await
}

/// 获取实时/缓存汇率
#[tauri::command]
pub async fn get_exchange_rate(config_rate: Option<f64>, auto_fetch: Option<bool>) -> Result<modules::api_pricing::ExchangeRateSnapshot, String> {
    let auto = auto_fetch.unwrap_or(true);
    Ok(modules::api_pricing::get_exchange_rate(config_rate, auto).await)
}

/// 获取所有账号配额价值与等效 Token 折算总览
#[tauri::command]
pub async fn get_account_quota_valuations() -> Result<modules::account_usage::QuotaValuationResponse, String> {
    modules::account_usage::calculate_all_account_valuations().await
}

/// 获取周期配额变化历史流水与汇总统计
#[tauri::command]
pub async fn get_quota_cycle_history(account_id: Option<String>) -> Result<modules::account_usage::QuotaCycleHistoryResponse, String> {
    modules::account_usage::get_quota_cycle_history(account_id).await
}

/// 获取经典款 / IDE / CLI 三端当前生效账号状态
#[tauri::command]
pub async fn get_active_clients_status() -> Result<crate::models::ActiveClientsStatus, String> {
    tokio::task::spawn_blocking(modules::account::detect_active_clients_status)
        .await
        .unwrap_or_else(|_| Err("Task panicked".to_string()))
}

/// 更新账号优先级 (1-100)
#[tauri::command]
pub async fn update_account_priority(account_id: String, priority: u8) -> Result<(), String> {
    modules::account::update_account_priority(&account_id, priority)
}

/// 更新账号 GCP Project ID
#[tauri::command]
pub async fn update_account_project_id(
    account_id: String,
    project_id: Option<String>,
) -> Result<(), String> {
    modules::account::update_account_project_id(&account_id, project_id)
}

/// 自动探测并持久化账号 GCP Project ID
#[tauri::command]
pub async fn auto_fetch_account_project_id(account_id: String) -> Result<String, String> {
    modules::account::auto_fetch_account_project_id(&account_id).await
}

/// 预热单个账号 100% 配额模型
#[tauri::command]
pub async fn warm_up_account(account_id: String) -> Result<String, String> {
    modules::quota::warm_up_account(&account_id).await
}

/// 预热所有可用账号
#[tauri::command]
pub async fn warm_up_all_accounts() -> Result<String, String> {
    modules::quota::warm_up_all_accounts().await
}

/// 获取设备指纹与版本列表
#[tauri::command]
pub async fn get_device_profiles(
    account_id: String,
) -> Result<modules::account::DeviceProfiles, String> {
    modules::account::get_device_profiles(&account_id)
}

/// 绑定设备指纹 (capture / generate)
#[tauri::command]
pub async fn bind_device_profile(
    account_id: String,
    mode: String,
) -> Result<crate::models::DeviceProfile, String> {
    modules::account::bind_device_profile(&account_id, &mode)
}

/// 预览生成新设备指纹（不落盘）
#[tauri::command]
pub async fn preview_generate_profile() -> Result<crate::models::DeviceProfile, String> {
    Ok(crate::modules::device::generate_profile())
}

/// 直接绑定给定指纹
#[tauri::command]
pub async fn bind_device_profile_with_profile(
    account_id: String,
    profile: crate::models::DeviceProfile,
) -> Result<crate::models::DeviceProfile, String> {
    modules::account::bind_device_profile_with_profile(
        &account_id,
        profile,
        Some("generated".to_string()),
    )
}

/// 应用已绑定指纹至 storage.json
#[tauri::command]
pub async fn apply_device_profile(
    account_id: String,
) -> Result<crate::models::DeviceProfile, String> {
    modules::account::apply_device_profile(&account_id)
}

/// 重置当前账号指纹为基线
#[tauri::command]
pub async fn restore_original_device() -> Result<String, String> {
    modules::account::restore_original_device()
}

#[tauri::command]
pub async fn list_device_versions(
    account_id: String,
) -> Result<modules::account::DeviceProfiles, String> {
    modules::account::list_device_versions(&account_id)
}

#[tauri::command]
pub async fn restore_device_version(
    account_id: String,
    version_id: String,
) -> Result<crate::models::DeviceProfile, String> {
    modules::account::restore_device_version(&account_id, &version_id)
}

#[tauri::command]
pub async fn delete_device_version(account_id: String, version_id: String) -> Result<(), String> {
    modules::account::delete_device_version(&account_id, &version_id)
}

#[tauri::command]
pub async fn open_device_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = modules::device::get_storage_dir()?;
    let dir_str = dir
        .to_str()
        .ok_or("无法解析存储目录路径为字符串")?
        .to_string();
    app.opener()
        .open_path(dir_str, None::<&str>)
        .map_err(|e| format!("打开目录失败: {}", e))
}

#[cfg(test)]
mod transfer_tests {
    use super::*;
    #[test]
    fn export_file_parser_preserves_metadata_and_rejects_invalid_batches() {
        let item = serde_json::json!({"email":"fixture@example.invalid","refresh_token":"1//fixture","oauth_client_key":"fixture-client","custom_label":"Fixture","is_gcp_tos":true});
        for text in [format!("\u{feff}{}", serde_json::json!({"schema_version":2,"accounts":[item.clone()]})),
            serde_json::json!([item.clone(), item.clone()]).to_string(), item.to_string()] {
            let items = parse_export_items_from_json(&text).unwrap();
            assert_eq!(items.len(), 1);
            assert_eq!(items[0].oauth_client_key.as_deref(), Some("fixture-client"));
            assert_eq!(items[0].custom_label.as_deref(), Some("Fixture"));
            assert!(items[0].is_gcp_tos);
        }
        for text in ["{}", "[]", r#"{"accounts":[]}"#, r#"{"schema_version":99,"accounts":[]}"#,
            r#"[{"refresh_token":"1//fixture"},{"refresh_token":""}]"#, r#"{"refresh_token":"invalid"}"#, "not-json"] {
            assert!(parse_export_items_from_json(text).is_err(), "{text}");
        }
    }
}
