//! 将真实进程身份、保存的凭据和无法确认的状态分开，供各界面使用。
use crate::models::{account::IdentitySource, Account, ActiveClientsStatus};
use crate::modules::{account, integration, migration, version};

pub(crate) fn detect() -> Result<ActiveClientsStatus, String> {
    let accounts = account::list_accounts()?;
    let (classic_account_id, classic_email, classic_source) =
        resolve(&accounts, migration::get_current_identity(Some("app")));
    let ide = if version::ide_shares_app_sign_in() {
        integration::read_from_system_keyring().map(migration::CurrentIdentity::Credentials)
    } else {
        migration::get_current_identity(Some("ide"))
    };
    let (ide_account_id, ide_email, ide_source) = resolve(&accounts, ide);
    let (agy_account_id, agy_email, agy_source) = resolve(&accounts,
        integration::read_cli_credentials().map(migration::CurrentIdentity::Credentials));
    Ok(ActiveClientsStatus {
        classic_account_id, classic_email, classic_source,
        ide_account_id, ide_email, ide_source,
        agy_account_id, agy_email, agy_source,
        observed_at: chrono::Utc::now().timestamp(),
    })
}

fn resolve(accounts: &[Account], observation: Result<migration::CurrentIdentity, String>)
    -> (Option<String>, Option<String>, IdentitySource)
{
    let Ok(identity) = observation else { return (None, None, IdentitySource::Unavailable); };
    // 损坏或空白的凭据不构成有效身份，即使账号文件里也恰好存在空值。
    let empty = match &identity {
        migration::CurrentIdentity::AppEmail(email) => email.trim().is_empty(),
        migration::CurrentIdentity::Credentials(state) => state.refresh_token.trim().is_empty(),
    };
    if empty { return (None, None, IdentitySource::Unavailable); }

    match identity {
        migration::CurrentIdentity::AppEmail(email) => {
            let mut matches = accounts.iter().filter(|account| account.email.eq_ignore_ascii_case(&email));
            let first = matches.next();
            let matched = if matches.next().is_none() { first } else { None };
            (matched.map(|account| account.id.clone()), Some(email), IdentitySource::RunningApp)
        }
        migration::CurrentIdentity::Credentials(state) => {
            // 优先按 refresh_token 精确匹配；若客户端重新登录导致 token 轮换，则退回按凭据内解析出的邮箱唯一匹配。
            let mut token_matches = accounts
                .iter()
                .filter(|account| account.token.refresh_token == state.refresh_token);
            if let Some(first) = token_matches.next() {
                return if token_matches.next().is_none() {
                    (Some(first.id.clone()), Some(first.email.clone()), IdentitySource::Credentials)
                } else {
                    (None, state.email, IdentitySource::Credentials)
                };
            }

            if let Some(observed_email) = state.email {
                let mut email_matches = accounts
                    .iter()
                    .filter(|account| account.email.eq_ignore_ascii_case(&observed_email));
                if let (Some(first), None) = (email_matches.next(), email_matches.next()) {
                    return (
                        Some(first.id.clone()),
                        Some(first.email.clone()),
                        IdentitySource::Credentials,
                    );
                }
                return (None, Some(observed_email), IdentitySource::Credentials);
            }

            (None, None, IdentitySource::Credentials)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TokenData;

    fn saved(id: &str) -> Account {
        Account::new(id.into(), format!("{id}@example.invalid"),
            TokenData::new("fixture-access".into(), "fixture-refresh".into(), 3600, None, None, None, false, None))
    }

    #[test]
    fn failed_observation_never_becomes_a_saved_account() {
        assert_eq!(resolve(&[saved("old")], Err("unavailable".into())),
            (None, None, IdentitySource::Unavailable));
        let mut invalid = saved("invalid");
        invalid.token.refresh_token.clear();
        let observation = migration::CurrentIdentity::Credentials(migration::ImportedOAuthState {
            refresh_token: String::new(), is_gcp_tos: false, project_id: None, email: None,
        });
        assert_eq!(resolve(&[invalid], Ok(observation)), (None, None, IdentitySource::Unavailable));
    }

    #[test]
    fn untracked_live_account_keeps_its_identity_without_selecting_another_account() {
        assert_eq!(resolve(&[saved("old")], Ok(migration::CurrentIdentity::AppEmail("new@example.invalid".into()))),
            (None, Some("new@example.invalid".into()), IdentitySource::RunningApp));
    }

    #[test]
    fn stored_credentials_are_not_reported_as_a_running_session() {
        let identity = || migration::CurrentIdentity::Credentials(migration::ImportedOAuthState {
            refresh_token: "fixture-refresh".into(), is_gcp_tos: false, project_id: None, email: None,
        });
        assert_eq!(resolve(&[saved("a")], Ok(identity())),
            (Some("a".into()), Some("a@example.invalid".into()), IdentitySource::Credentials));
        assert_eq!(resolve(&[saved("a"), saved("b")], Ok(identity())),
            (None, None, IdentitySource::Credentials));
    }

    #[test]
    fn rotated_refresh_token_falls_back_to_unique_email_match_and_preserves_untracked_email() {
        let rotated = migration::CurrentIdentity::Credentials(migration::ImportedOAuthState {
            refresh_token: "fixture-refresh-rotated".into(),
            is_gcp_tos: true,
            project_id: None,
            email: Some("A@EXAMPLE.INVALID".into()),
        });
        assert_eq!(
            resolve(&[saved("a"), saved("b")], Ok(rotated)),
            (Some("a".into()), Some("a@example.invalid".into()), IdentitySource::Credentials)
        );

        let untracked = migration::CurrentIdentity::Credentials(migration::ImportedOAuthState {
            refresh_token: "fixture-refresh-new".into(),
            is_gcp_tos: true,
            project_id: None,
            email: Some("new@example.invalid".into()),
        });
        assert_eq!(
            resolve(&[saved("a")], Ok(untracked)),
            (None, Some("new@example.invalid".into()), IdentitySource::Credentials)
        );
    }
}
