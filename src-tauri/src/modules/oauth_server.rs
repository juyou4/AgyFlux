use crate::modules::oauth;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use serde::Serialize;
use std::future::Future;
use std::sync::{Mutex, OnceLock};
use tauri::Url;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinSet;
use tokio::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio::sync::watch;

struct OAuthFlowState {
    auth_url: String,
    redirect_uri: String,
    state: String,
    client_key: String,
    code_verifier: Option<String>,
    cancel_tx: watch::Sender<bool>,
    code_tx: mpsc::Sender<Result<String, String>>,
    code_rx: Option<mpsc::Receiver<Result<String, String>>>,
    expires_at: Instant,
    code_received: bool,
    committed: bool,
}

static OAUTH_FLOW_STATE: OnceLock<Mutex<Option<OAuthFlowState>>> = OnceLock::new();
static PREPARATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Serialize)]
pub struct OAuthLoginSession {
    pub flow_id: String,
    pub auth_url: String,
    pub expires_in: u64,
}

fn get_oauth_flow_state() -> &'static Mutex<Option<OAuthFlowState>> {
    OAUTH_FLOW_STATE.get_or_init(|| Mutex::new(None))
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn oauth_result_html(success: bool) -> String {
    // 浏览器回调已收到，但令牌交换和账号保存仍由应用继续处理。
    let (status, result, title, description) = if success {
        ("200 OK", "success", "授权信息已收到", "请返回 AgyFlux，查看账号添加结果。")
    } else {
        ("400 Bad Request", "error", "授权未完成", "请返回 AgyFlux，重新发起授权。")
    };
    let icon = base64::engine::general_purpose::STANDARD.encode(include_bytes!("../../icons/32x32.png"));
    let body = include_str!("oauth_result.html")
        .replace("{{RESULT}}", result)
        .replace("{{TITLE}}", title)
        .replace("{{DESCRIPTION}}", description)
        .replace("{{APP_ICON}}", &icon);
    format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

/// Read a complete bounded header. Preconnects, fragments and unrelated requests
/// must not consume the authorization channel or close the listener.
async fn read_callback(mut stream: TcpStream, expected_state: String) -> Option<Result<String, String>> {
    let header = tokio::time::timeout(Duration::from_secs(3), async {
        let mut data = Vec::new();
        let mut buffer = [0u8; 1024];
        loop {
            let count = stream.read(&mut buffer).await.ok()?;
            if count == 0 { return None; }
            data.extend_from_slice(&buffer[..count]);
            if data.len() > 8192 { return None; }
            if data.windows(4).any(|part| part == b"\r\n\r\n") { return Some(data); }
        }
    }).await.ok().flatten();
    let result = header.and_then(|bytes| {
        let request = std::str::from_utf8(&bytes).ok()?;
        let mut parts = request.lines().next()?.split_whitespace();
        if parts.next()? != "GET" { return None; }
        let target = parts.next()?;
        if !matches!(parts.next(), Some("HTTP/1.1" | "HTTP/1.0")) || parts.next().is_some() { return None; }
        let url = Url::parse(&format!("http://localhost{target}")).ok()?;
        if url.path() != "/oauth-callback" || url.fragment().is_some() { return None; }
        let values = |key: &str| url.query_pairs().filter(|(name, _)| name == key).map(|(_, value)| value.into_owned()).collect::<Vec<_>>();
        let states = values("state");
        if states.len() != 1 || states[0] != expected_state { return None; }
        let codes = values("code");
        let errors = values("error");
        if codes.len() == 1 && !codes[0].is_empty() && errors.is_empty() {
            Some(Ok(codes[0].clone()))
        } else if codes.is_empty() && errors.len() == 1 {
            Some(Err("OAuth authorization was declined. Start a new authorization flow.".into()))
        } else { None }
    });
    let response = oauth_result_html(matches!(result, Some(Ok(_))));
    let _ = tokio::time::timeout(Duration::from_secs(1), stream.write_all(response.as_bytes())).await;
    result
}

async fn listen_for_callback(
    listener: TcpListener, expected_state: String,
    tx: mpsc::Sender<Result<String, String>>, mut cancel: watch::Receiver<bool>,
    expires_at: Instant, app_handle: Option<tauri::AppHandle>,
) {
    let mut connections = JoinSet::new();
    loop {
        if *cancel.borrow() { break; }
        tokio::select! {
            _ = cancel.changed() => break,
            _ = tokio::time::sleep_until(expires_at) => {
                let _ = tx.try_send(Err("OAuth authorization timed out. Start a new authorization flow.".into()));
                break;
            }
            completed = connections.join_next(), if !connections.is_empty() => {
                if let Some(Ok(Some(result))) = completed {
                    if tx.try_send(result).is_ok() {
                        if let Some(h) = &app_handle {
                            use tauri::Emitter;
                            let _ = h.emit("oauth-callback-received", ());
                        }
                    }
                    break;
                }
            }
            accepted = listener.accept() => {
                match accepted {
                    Ok((stream, _)) if connections.len() < 8 => {
                        connections.spawn(read_callback(stream, expected_state.clone()));
                    }
                    Ok(_) => {},
                    Err(_) => {
                        let _ = tx.try_send(Err("OAuth callback listener failed. Start a new authorization flow.".into()));
                        break;
                    }
                }
            }
        }
    }
    // Dropping JoinSet aborts idle readers; a cancelled flow releases its sockets.
}

async fn wait_for_code(
    rx: &mut mpsc::Receiver<Result<String, String>>, cancel: &mut watch::Receiver<bool>, expires_at: Instant,
) -> Result<String, String> {
    if *cancel.borrow() { return Err("OAuth cancelled".into()); }
    tokio::select! {
        biased;
        result = rx.recv() => result.unwrap_or_else(|| Err("OAuth flow channel closed unexpectedly".into())),
        _ = cancel.changed() => Err("OAuth cancelled".into()),
        _ = tokio::time::sleep_until(expires_at) => Err("OAuth authorization timed out. Start a new authorization flow.".into()),
    }
}

async fn receive_oauth_code() -> Result<(String, String, String, Option<String>), String> {
    let (mut rx, mut cancel, expires_at, redirect_uri, client_key, expected_state, verifier) = {
        let mut lock = get_oauth_flow_state().lock().map_err(|_| "OAuth state lock corrupted")?;
        let state = lock.as_mut().ok_or("OAuth state does not exist")?;
        let rx = state.code_rx.take().ok_or("OAuth authorization already in progress")?;
        (rx, state.cancel_tx.subscribe(), state.expires_at, state.redirect_uri.clone(), state.client_key.clone(), state.state.clone(), state.code_verifier.clone())
    };
    let result = wait_for_code(&mut rx, &mut cancel, expires_at).await;
    if let Ok(mut lock) = get_oauth_flow_state().lock() {
        // An older waiter must never clear a replacement authorization flow.
        if lock.as_ref().is_some_and(|state| state.state == expected_state) {
            if let Some(state) = lock.take() { let _ = state.cancel_tx.send(true); }
        }
    }
    Ok((result?, redirect_uri, client_key, verifier))
}

async fn ensure_oauth_flow_prepared(
    app_handle: Option<tauri::AppHandle>,
    requested_client_key: Option<String>,
    replace: bool,
) -> Result<String, String> {
    let _preparation = PREPARATION_LOCK.lock().await;
    {
        let mut state = get_oauth_flow_state().lock().map_err(|_| "OAuth state lock corrupted")?;
        if state.as_ref().is_some_and(|state| state.committed) {
            return Err("OAuth account is being saved; please wait.".into());
        }
        if let Some(s) = state.as_ref() {
            let same_client = requested_client_key.as_ref()
                .is_none_or(|key| s.client_key == key.to_ascii_lowercase());
            if !replace && same_client && s.code_rx.is_some() && Instant::now() < s.expires_at {
                return Ok(s.auth_url.clone());
            }
        }
        // 检查提交状态与替换旧会话必须持同一把锁，避免取消已经保存的账号。
        if let Some(previous) = state.take() { let _ = previous.cancel_tx.send(true); }
    }

    // Create loopback listeners.
    // Some browsers resolve `localhost` to IPv6 (::1). To avoid "localhost refused connection",
    // we try to listen on BOTH IPv6 and IPv4 with the same port when possible.
    let mut ipv4_listener: Option<TcpListener> = None;
    let mut ipv6_listener: Option<TcpListener> = None;

    // Prefer creating one listener on an ephemeral port first, then bind the other stack to same port.
    // If both are available -> use `http://localhost:<port>` as redirect URI.
    // If only one is available -> use an explicit IP to force correct stack.
    let port: u16;
    match TcpListener::bind("[::1]:0").await {
        Ok(l6) => {
            port = l6
                .local_addr()
                .map_err(|e| format!("failed_to_get_local_port: {}", e))?
                .port();
            ipv6_listener = Some(l6);

            match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
                Ok(l4) => ipv4_listener = Some(l4),
                Err(e) => {
                    crate::modules::logger::log_warn(&format!(
                        "failed_to_bind_ipv4_callback_port_127_0_0_1:{} (will only listen on IPv6): {}",
                        port, e
                    ));
                }
            }
        }
        Err(_) => {
            let l4 = TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|e| format!("failed_to_bind_local_port: {}", e))?;
            port = l4
                .local_addr()
                .map_err(|e| format!("failed_to_get_local_port: {}", e))?
                .port();
            ipv4_listener = Some(l4);

            match TcpListener::bind(format!("[::1]:{}", port)).await {
                Ok(l6) => ipv6_listener = Some(l6),
                Err(e) => {
                    crate::modules::logger::log_warn(&format!(
                        "failed_to_bind_ipv6_callback_port_::1:{} (will only listen on IPv4): {}",
                        port, e
                    ));
                }
            }
        }
    }

    let has_ipv4 = ipv4_listener.is_some();
    let has_ipv6 = ipv6_listener.is_some();

    let redirect_uri = if has_ipv4 && has_ipv6 {
        format!("http://localhost:{}/oauth-callback", port)
    } else if has_ipv4 {
        format!("http://127.0.0.1:{}/oauth-callback", port)
    } else {
        format!("http://[::1]:{}/oauth-callback", port)
    };

    let state_str = uuid::Uuid::new_v4().to_string();
    let (mut auth_url, resolved_client_key) = oauth::get_auth_url_with_client(
        &redirect_uri,
        &state_str,
        requested_client_key.as_deref(),
    )?;
    // 新会话使用 S256；旧命令的调用方式保持兼容。
    let code_verifier = replace.then(|| URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>()));
    if let Some(verifier) = &code_verifier {
        let mut url = Url::parse(&auth_url).map_err(|_| "Invalid OAuth URL")?;
        url.query_pairs_mut().append_pair("code_challenge", &pkce_challenge(verifier))
            .append_pair("code_challenge_method", "S256");
        auth_url = url.to_string();
    }

    // Cancellation signal (supports multiple consumers)
    let (cancel_tx, cancel_rx) = watch::channel(false);
    // Use mpsc instead of oneshot to allow multiple senders (listener OR manual input)
    let (code_tx, code_rx) = mpsc::channel::<Result<String, String>>(1);

    // Capture the expected state before accepting connections; do not race global state setup.
    let expires_at = Instant::now() + Duration::from_secs(300);
    for listener in [ipv4_listener, ipv6_listener].into_iter().flatten() {
        tokio::spawn(listen_for_callback(
            listener, state_str.clone(), code_tx.clone(), cancel_rx.clone(),
            expires_at, app_handle.clone(),
        ));
    }

    // Save state
    if let Ok(mut state) = get_oauth_flow_state().lock() {
        *state = Some(OAuthFlowState {
            auth_url: auth_url.clone(),
            redirect_uri,
            state: state_str,
            client_key: resolved_client_key,
            code_verifier,
            cancel_tx,
            code_tx,
            code_rx: Some(code_rx),
            expires_at,
            code_received: false,
            committed: false,
        });
    }

    // Send event to frontend (for display/copying link)
    if let Some(h) = app_handle {
        use tauri::Emitter;
        let _ = h.emit("oauth-url-generated", &auth_url);
    }

    Ok(auth_url)
}

/// Pre-generate OAuth URL (does not open browser, does not block waiting for callback)
pub async fn prepare_oauth_url(
    app_handle: Option<tauri::AppHandle>,
    oauth_client_key: Option<String>,
) -> Result<String, String> {
    ensure_oauth_flow_prepared(app_handle, oauth_client_key, false).await
}

/// Start OAuth flow and wait for callback, then exchange token
pub async fn start_oauth_flow(
    app_handle: Option<tauri::AppHandle>,
    oauth_client_key: Option<String>,
) -> Result<oauth::TokenResponse, String> {
    // Ensure URL + listener are ready (this way if the user authorizes first, it won't get stuck)
    let auth_url = ensure_oauth_flow_prepared(app_handle.clone(), oauth_client_key, false).await?;

    if let Some(h) = app_handle {
        // Open default browser
        use tauri_plugin_opener::OpenerExt;
        h.opener()
            .open_url(&auth_url, None::<String>)
            .map_err(|e| format!("failed_to_open_browser: {}", e))?;
    }

    let (code, redirect_uri, client_key, verifier) = receive_oauth_code().await?;
    oauth::exchange_code_with_verifier(&code, &redirect_uri, Some(&client_key), verifier.as_deref()).await
}

/// Завершить OAuth flow без открытия браузера.
/// Предполагается, что пользователь открыл ссылку вручную (или ранее была открыта),
/// а мы только ждём callback и обмениваем code на token.
pub async fn complete_oauth_flow(
    app_handle: Option<tauri::AppHandle>,
) -> Result<oauth::TokenResponse, String> {
    // Ensure URL + listeners exist
    let _ = ensure_oauth_flow_prepared(app_handle, None, false).await?;

    let (code, redirect_uri, client_key, verifier) = receive_oauth_code().await?;
    oauth::exchange_code_with_verifier(&code, &redirect_uri, Some(&client_key), verifier.as_deref()).await
}

/// 新界面只准备一次会话，浏览器、手动回调和等待者共用同一个 flow_id。
pub async fn prepare_login(app: Option<tauri::AppHandle>) -> Result<OAuthLoginSession, String> {
    let auth_url = ensure_oauth_flow_prepared(app, None, true).await?;
    let lock = get_oauth_flow_state().lock().map_err(|_| "OAuth state lock corrupted")?;
    let flow = lock.as_ref().filter(|flow| flow.auth_url == auth_url)
        .ok_or("OAuth session was replaced; start again.")?;
    Ok(OAuthLoginSession {
        flow_id: flow.state.clone(), auth_url,
        expires_in: flow.expires_at.saturating_duration_since(Instant::now()).as_secs(),
    })
}

fn require_flow<'a>(flow: &'a mut Option<OAuthFlowState>, id: &str) -> Result<&'a mut OAuthFlowState, String> {
    let flow = flow.as_mut().filter(|flow| flow.state == id)
        .ok_or("OAuth session is no longer active. Start a new login.")?;
    if Instant::now() >= flow.expires_at {
        return Err("OAuth authorization timed out. Start a new login.".into());
    }
    if *flow.cancel_tx.borrow() { return Err("OAuth cancelled".into()); }
    Ok(flow)
}

pub fn login_url(flow_id: &str) -> Result<String, String> {
    let mut lock = get_oauth_flow_state().lock().map_err(|_| "OAuth state lock corrupted")?;
    Ok(require_flow(&mut lock, flow_id)?.auth_url.clone())
}

/// 取消仅作用于指定会话，迟到的旧窗口清理不能终止新登录。
pub fn cancel_login(flow_id: Option<&str>) -> Result<bool, String> {
    let mut lock = get_oauth_flow_state().lock().map_err(|_| "OAuth state lock corrupted")?;
    let Some(flow) = lock.as_ref() else { return Ok(false); };
    if flow.committed || flow_id.is_some_and(|id| id != flow.state) { return Ok(false); }
    if let Some(flow) = lock.take() { let _ = flow.cancel_tx.send(true); }
    Ok(true)
}

/// 等待、换取令牌、读取资料直到保存账号都属于同一可取消会话。
pub(crate) async fn run_prepared_login<T, F, Fut>(flow_id: &str, action: F) -> Result<T, String>
where F: FnOnce(String, String, String, Option<String>) -> Fut, Fut: Future<Output = Result<T, String>> {
    let (mut rx, mut cancel, expires_at, redirect, client, verifier) = {
        let mut lock = get_oauth_flow_state().lock().map_err(|_| "OAuth state lock corrupted")?;
        let flow = require_flow(&mut lock, flow_id)?;
        let rx = flow.code_rx.take().ok_or("OAuth authorization already in progress")?;
        (rx, flow.cancel_tx.subscribe(), flow.expires_at, flow.redirect_uri.clone(), flow.client_key.clone(), flow.code_verifier.clone())
    };
    let mut code_cancel = cancel.clone();
    let work = async {
        let code = wait_for_code(&mut rx, &mut code_cancel, expires_at).await?;
        {
            let mut lock = get_oauth_flow_state().lock().map_err(|_| "OAuth state lock corrupted")?;
            require_flow(&mut lock, flow_id)?.code_received = true;
        }
        action(code, redirect, client, verifier).await
    };
    let result = tokio::select! {
        biased;
        _ = cancel.changed() => Err("OAuth cancelled".into()),
        _ = tokio::time::sleep_until(expires_at) => Err("OAuth authorization timed out. Start a new login.".into()),
        result = work => result,
    };
    if let Ok(mut lock) = get_oauth_flow_state().lock() {
        if lock.as_ref().is_some_and(|flow| flow.state == flow_id) {
            if let Some(flow) = lock.take() { let _ = flow.cancel_tx.send(true); }
        }
    }
    result
}

/// 保存前再次检查会话；持锁提交，明确区分已取消与已经保存完成的登录。
pub(crate) fn commit_login<T>(flow_id: &str, save: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let mut lock = get_oauth_flow_state().lock().map_err(|_| "OAuth state lock corrupted")?;
    let flow = require_flow(&mut lock, flow_id)?;
    if flow.committed { return Err("OAuth account was already saved.".into()); }
    let result = save()?;
    flow.committed = true;
    Ok(result)
}

fn parse_manual_callback(input: &str, expected_state: &str, redirect_uri: &str, provided_state: Option<&str>) -> Result<String, String> {
    let input = input.trim();
    if input.is_empty() || input.len() > 8192 { return Err("Enter a valid authorization code or callback URL.".into()); }
    if provided_state.is_some_and(|state| state != expected_state) {
        return Err("OAuth state mismatch. Use the callback from this login.".into());
    }
    if input.contains("://") || input.starts_with("http") {
        let url = Url::parse(input).map_err(|_| "Invalid OAuth callback URL.")?;
        let redirect = Url::parse(redirect_uri).map_err(|_| "Invalid OAuth redirect configuration.")?;
        if url.scheme() != redirect.scheme() || url.host_str() != redirect.host_str()
            || url.port_or_known_default() != redirect.port_or_known_default() || url.path() != redirect.path()
            || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
            return Err("Callback URL does not belong to this login. Copy the full address from the authorization page.".into());
        }
        let values = |key: &str| url.query_pairs().filter(|(name, _)| name == key)
            .map(|(_, value)| value.into_owned()).collect::<Vec<_>>();
        let states = values("state");
        if states.len() != 1 || states[0] != expected_state {
            return Err("OAuth state mismatch. Use the callback from this login.".into());
        }
        let codes = values("code");
        if !values("error").is_empty() { return Err("OAuth authorization was declined. Start a new login.".into()); }
        if codes.len() != 1 || codes[0].trim().is_empty() { return Err("Callback URL must contain exactly one authorization code.".into()); }
        return Ok(codes[0].clone());
    }
    if input.chars().any(char::is_whitespace) || input.contains('#') || input.contains('?') {
        return Err("Enter the authorization code or the complete callback URL.".into());
    }
    Ok(input.to_string())
}

/// 手动提交只投递回调，不启动第二个等待者，也不创建新的授权链接。
pub async fn submit_oauth_code(code_input: String, state_input: Option<String>, flow_id: Option<String>) -> Result<(), String> {
    let mut lock = get_oauth_flow_state().lock().map_err(|_| "OAuth state lock corrupted")?;
    let expected_id = flow_id.or_else(|| lock.as_ref().map(|flow| flow.state.clone()))
        .ok_or("No active OAuth flow found")?;
    let flow = require_flow(&mut lock, &expected_id)?;
    if flow.code_received || flow.committed { return Err("OAuth login is already being completed; please wait.".into()); }
    let code = parse_manual_callback(&code_input, &flow.state, &flow.redirect_uri, state_input.as_deref())?;
    flow.code_tx.try_send(Ok(code))
        .map_err(|_| "OAuth callback was already submitted or this login is no longer waiting.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    static SESSION_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    fn session_fixture(id: &str, lifetime: Duration) {
        let (code_tx, code_rx) = mpsc::channel(1);
        let (cancel_tx, _) = watch::channel(false);
        *get_oauth_flow_state().lock().unwrap() = Some(OAuthFlowState {
            auth_url: "https://example.invalid/fixture".into(),
            redirect_uri: "http://localhost:12345/oauth-callback".into(),
            state: id.into(), client_key: "fixture-client".into(), code_verifier: Some("fixture-verifier".into()),
            cancel_tx, code_tx, code_rx: Some(code_rx), expires_at: Instant::now() + lifetime,
            code_received: false, committed: false,
        });
    }

    #[test]
    fn pkce_s256_matches_standard_vector() {
        assert_eq!(pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn manual_callback_is_bound_to_this_session_and_redirect() {
        let redirect = "http://localhost:12345/oauth-callback";
        let parse = |value: &str| parse_manual_callback(value, "fixture-state", redirect, None);
        assert_eq!(parse("  raw-code  ").unwrap(), "raw-code");
        assert_eq!(parse(&format!("{redirect}?code=4%2Ffixture%2Bcode&state=fixture-state")).unwrap(), "4/fixture+code");
        for value in [
            format!("{redirect}?code=secret&state=old-state"),
            format!("{redirect}?code=secret"),
            format!("{redirect}?code=secret&state=fixture-state&state=fixture-state"),
            format!("{redirect}?code=secret&code=other&state=fixture-state"),
            format!("{redirect}?state=fixture-state"),
            format!("{redirect}?code=secret&state=fixture-state#fragment"),
            format!("{redirect}?error=secret&state=fixture-state"),
            "http://evil.invalid:12345/oauth-callback?code=secret&state=fixture-state".into(),
            "http://localhost:12346/oauth-callback?code=secret&state=fixture-state".into(),
            "http://localhost:12345/wrong?code=secret&state=fixture-state".into(),
            "http://user@localhost:12345/oauth-callback?code=secret&state=fixture-state".into(),
            "secret with spaces".into(),
            "x".repeat(8193),
        ] {
            let error = parse(&value).unwrap_err();
            assert!(!error.contains("secret"));
        }
        assert!(parse_manual_callback("raw-code", "fixture-state", redirect, Some("wrong")).is_err());
    }

    #[tokio::test]
    async fn manual_submission_and_browser_result_share_one_waiter() {
        let _serial = SESSION_TEST_LOCK.lock().await;
        session_fixture("manual", Duration::from_secs(5));
        let (entered, ready) = tokio::sync::oneshot::channel();
        let (release, proceed) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(run_prepared_login("manual", |code, redirect, client, verifier| async move {
            assert_eq!(code, "fixture-code");
            assert_eq!(redirect, "http://localhost:12345/oauth-callback");
            assert_eq!(client, "fixture-client");
            assert_eq!(verifier.as_deref(), Some("fixture-verifier"));
            entered.send(()).unwrap();
            proceed.await.unwrap();
            commit_login("manual", || Ok("saved"))
        }));
        submit_oauth_code("fixture-code".into(), None, Some("manual".into())).await.unwrap();
        ready.await.unwrap();
        let second = run_prepared_login("manual", |_, _, _, _| async { Ok(()) }).await.unwrap_err();
        assert!(second.contains("already in progress"));
        assert!(submit_oauth_code("duplicate".into(), None, Some("manual".into())).await.is_err());
        release.send(()).unwrap();
        assert_eq!(task.await.unwrap().unwrap(), "saved");
        assert!(get_oauth_flow_state().lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn cancelling_during_exchange_prevents_persistence() {
        let _serial = SESSION_TEST_LOCK.lock().await;
        session_fixture("cancel-exchange", Duration::from_secs(5));
        let (entered, ready) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(run_prepared_login("cancel-exchange", |_, _, _, _| async move {
            entered.send(()).unwrap();
            std::future::pending::<()>().await;
            commit_login("cancel-exchange", || { panic!("取消后不能保存账号"); #[allow(unreachable_code)] Ok(()) })
        }));
        submit_oauth_code("fixture".into(), None, Some("cancel-exchange".into())).await.unwrap();
        ready.await.unwrap();
        assert!(cancel_login(Some("cancel-exchange")).unwrap());
        assert!(task.await.unwrap().unwrap_err().contains("cancelled"));
        assert!(commit_login("cancel-exchange", || Ok(())).is_err());
    }

    #[tokio::test]
    async fn old_cancellation_and_cleanup_do_not_touch_replacement() {
        let _serial = SESSION_TEST_LOCK.lock().await;
        session_fixture("old", Duration::from_secs(5));
        let (entered, ready) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(run_prepared_login("old", |_, _, _, _| async move {
            entered.send(()).unwrap();
            std::future::pending::<Result<(), String>>().await
        }));
        submit_oauth_code("fixture".into(), None, Some("old".into())).await.unwrap();
        ready.await.unwrap();
        assert!(cancel_login(Some("old")).unwrap());
        session_fixture("new", Duration::from_secs(5));
        assert!(task.await.unwrap().is_err());
        assert!(!cancel_login(Some("old")).unwrap());
        assert!(login_url("new").is_ok());
        assert!(submit_oauth_code("fixture".into(), None, Some("old".into())).await.is_err());
        assert!(cancel_login(Some("new")).unwrap());
    }

    #[tokio::test]
    async fn deadline_covers_exchange_and_rejects_late_commit() {
        let _serial = SESSION_TEST_LOCK.lock().await;
        session_fixture("timeout", Duration::from_millis(50));
        submit_oauth_code("fixture".into(), None, Some("timeout".into())).await.unwrap();
        let error = run_prepared_login("timeout", |_, _, _, _| async {
            std::future::pending::<Result<(), String>>().await
        }).await.unwrap_err();
        assert!(error.contains("timed out"));
        assert!(commit_login("timeout", || Ok(())).is_err());
        assert!(get_oauth_flow_state().lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn committed_login_cannot_be_cancelled_or_replaced() {
        let _serial = SESSION_TEST_LOCK.lock().await;
        session_fixture("committed", Duration::from_secs(5));
        assert_eq!(commit_login("committed", || Ok("saved")).unwrap(), "saved");
        assert!(!cancel_login(Some("committed")).unwrap());
        assert!(ensure_oauth_flow_prepared(None, None, true).await.unwrap_err().contains("being saved"));
        assert!(commit_login("committed", || Ok(())).is_err());
        // 合成会话没有等待者，测试自行清理。
        *get_oauth_flow_state().lock().unwrap() = None;
    }

    async fn fixture(lifetime: Duration) -> (std::net::SocketAddr, mpsc::Receiver<Result<String, String>>, watch::Sender<bool>, tokio::task::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (tx, rx) = mpsc::channel(1);
        let (cancel, cancelled) = watch::channel(false);
        let task = tokio::spawn(listen_for_callback(listener, "fixture-state".into(), tx, cancelled, Instant::now() + lifetime, None));
        (address, rx, cancel, task)
    }

    async fn request(address: std::net::SocketAddr, text: &[u8]) -> String {
        let mut stream = TcpStream::connect(address).await.unwrap();
        stream.write_all(text).await.unwrap();
        let mut response = Vec::new();
        let _ = tokio::time::timeout(Duration::from_secs(2), stream.read_to_end(&mut response)).await.unwrap();
        String::from_utf8(response).unwrap()
    }

    #[tokio::test]
    async fn callback_result_pages_are_complete_utf8_without_authorization_values() {
        for (query, status, result) in [
            ("code=fixture-code", "200 OK", "success"),
            ("error=fixture-secret", "400 Bad Request", "error"),
        ] {
            let (address, mut rx, _cancel, task) = fixture(Duration::from_secs(5)).await;
            let message = format!("GET /oauth-callback?{query}&state=fixture-state HTTP/1.1\r\nHost: localhost\r\n\r\n");
            let response = request(address, message.as_bytes()).await;
            let (headers, body) = response.split_once("\r\n\r\n").unwrap();
            assert!(headers.starts_with(&format!("HTTP/1.1 {status}\r\n")));
            assert!(headers.contains("Content-Type: text/html; charset=utf-8"));
            let length: usize = headers.lines().find_map(|line| line.strip_prefix("Content-Length: ")).unwrap().parse().unwrap();
            assert_eq!(length, body.len());
            assert!(body.contains(&format!("data-result=\"{result}\"")));
            assert!(body.contains("AgyFlux"));
            assert!(!body.contains("{{"));
            for sensitive in ["fixture-code", "fixture-secret", "fixture-state"] {
                assert!(!body.contains(sensitive));
            }
            assert_eq!(rx.recv().await.unwrap().is_ok(), result == "success");
            task.await.unwrap();
        }
    }

    #[tokio::test]
    async fn preconnect_invalid_requests_and_fragmented_headers_do_not_consume_callback() {
        let (address, mut rx, cancel, task) = fixture(Duration::from_secs(10)).await;
        let idle = TcpStream::connect(address).await.unwrap();
        drop(TcpStream::connect(address).await.unwrap());
        for text in [
            "GET /favicon.ico HTTP/1.1\r\n\r\n",
            "GET /oauth-callback?code=fixture-code&state=wrong HTTP/1.1\r\n\r\n",
            "GET /oauth-callback?code=a&code=b&state=fixture-state HTTP/1.1\r\n\r\n",
        ] {
            request(address, text.as_bytes()).await;
            assert!(matches!(rx.try_recv(), Err(mpsc::error::TryRecvError::Empty)));
        }
        let mut stream = TcpStream::connect(address).await.unwrap();
        stream.write_all(b"GET /oauth-callback?code=fixture-").await.unwrap();
        tokio::task::yield_now().await;
        stream.write_all(b"code&state=fixture-state HTTP/1.1\r\nHost: localhost\r\n\r\n").await.unwrap();
        assert_eq!(tokio::time::timeout(Duration::from_secs(2), rx.recv()).await.unwrap(), Some(Ok("fixture-code".into())));
        task.await.unwrap();
        assert!(TcpStream::connect(address).await.is_err());
        drop(idle);
        drop(cancel);
    }

    #[tokio::test]
    async fn authenticated_denial_is_terminal_but_never_echoes_provider_data() {
        let (address, mut rx, _cancel, task) = fixture(Duration::from_secs(10)).await;
        request(address, b"GET /oauth-callback?error=fixture-secret&state=fixture-state HTTP/1.1\r\n\r\n").await;
        let error = rx.recv().await.unwrap().unwrap_err();
        assert!(error.contains("declined"));
        assert!(!error.contains("fixture-secret"));
        task.await.unwrap();
    }

    #[tokio::test]
    async fn oversized_headers_do_not_end_the_flow() {
        let (address, mut rx, cancel, task) = fixture(Duration::from_secs(10)).await;
        request(address, &vec![b'x'; 9000]).await;
        request(address, b"GET /oauth-callback?code=ok&state=fixture-state HTTP/1.0\r\n\r\n").await;
        assert_eq!(rx.recv().await, Some(Ok("ok".into())));
        task.await.unwrap();
        drop(cancel);
    }

    #[tokio::test]
    async fn timeout_and_cancellation_release_listeners_and_waiters() {
        for cancelled in [false, true] {
            let (address, mut rx, cancel, task) = fixture(Duration::from_millis(50)).await;
            let _idle = TcpStream::connect(address).await.unwrap();
            let mut subscription = cancel.subscribe();
            if cancelled { cancel.send(true).unwrap(); }
            let error = tokio::time::timeout(Duration::from_secs(1), wait_for_code(&mut rx, &mut subscription, Instant::now() + Duration::from_millis(80))).await.unwrap().unwrap_err();
            assert!(error.contains(if cancelled { "cancelled" } else { "timed out" }));
            task.await.unwrap();
            assert!(TcpStream::connect(address).await.is_err());
        }
    }

    #[tokio::test]
    async fn an_already_queued_manual_code_does_not_block_listener_cleanup() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (tx, mut rx) = mpsc::channel(1);
        tx.try_send(Ok("manual".into())).unwrap();
        let (_cancel, cancelled) = watch::channel(false);
        let task = tokio::spawn(listen_for_callback(listener, "fixture-state".into(), tx, cancelled, Instant::now() + Duration::from_secs(5), None));
        request(address, b"GET /oauth-callback?code=browser&state=fixture-state HTTP/1.1\r\n\r\n").await;
        tokio::time::timeout(Duration::from_secs(1), task).await.unwrap().unwrap();
        assert_eq!(rx.recv().await, Some(Ok("manual".into())));
    }
}
