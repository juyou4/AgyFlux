//! 普通界面的账号视图。凭据仅在后端持久化和显式导出时使用。
use super::{Account, DeviceProfile, DeviceProfileVersion, QuotaData};
use serde::Serialize;
use std::collections::HashSet;

#[derive(Debug, Serialize)]
pub struct AccountView {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub priority: u8,
    pub token: TokenMetadata,
    pub device_profile: Option<DeviceProfile>,
    pub device_history: Vec<DeviceProfileVersion>,
    pub quota: Option<QuotaData>,
    pub disabled: bool,
    pub disabled_reason: Option<String>,
    pub disabled_at: Option<i64>,
    pub protected_models: HashSet<String>,
    pub validation_blocked: bool,
    pub validation_blocked_until: Option<i64>,
    pub validation_blocked_reason: Option<String>,
    pub validation_url: Option<String>,
    pub created_at: i64,
    pub last_used: i64,
    pub custom_label: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TokenMetadata {
    pub expires_in: i64,
    pub expiry_timestamp: i64,
    pub token_type: String,
    pub email: Option<String>,
    pub project_id: Option<String>,
    pub is_gcp_tos: bool,
    pub oauth_client_key: Option<String>,
}

impl From<Account> for AccountView {
    fn from(account: Account) -> Self {
        Self {
            id: account.id,
            email: account.email,
            name: account.name,
            priority: account.priority,
            token: TokenMetadata {
                expires_in: account.token.expires_in,
                expiry_timestamp: account.token.expiry_timestamp,
                token_type: account.token.token_type,
                email: account.token.email,
                project_id: account.token.project_id,
                is_gcp_tos: account.token.is_gcp_tos,
                oauth_client_key: account.token.oauth_client_key,
            },
            device_profile: account.device_profile,
            device_history: account.device_history,
            quota: account.quota,
            disabled: account.disabled,
            disabled_reason: account.disabled_reason,
            disabled_at: account.disabled_at,
            protected_models: account.protected_models,
            validation_blocked: account.validation_blocked,
            validation_blocked_until: account.validation_blocked_until,
            validation_blocked_reason: account.validation_blocked_reason,
            validation_url: account.validation_url,
            created_at: account.created_at,
            last_used: account.last_used,
            custom_label: account.custom_label,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TokenData;

    #[test]
    fn account_view_excludes_credentials_without_changing_persistence() {
        let account = Account::new("fixture".into(), "fixture@example.invalid".into(),
            TokenData::new("secret-access".into(), "secret-refresh".into(), 3600,
                None, Some("project".into()), Some("secret-session".into()), false,
                Some("secret-id".into())));
        let saved = serde_json::to_value(&account).unwrap();
        assert_eq!(saved["token"]["refresh_token"], "secret-refresh");
        let view = serde_json::to_value(AccountView::from(account)).unwrap();
        for key in ["access_token", "refresh_token", "id_token", "session_id"] {
            assert!(view["token"].get(key).is_none(), "{key} leaked into account view");
        }
        assert!(!view.to_string().contains("secret-"));
        assert_eq!(view["token"]["project_id"], "project");
    }
}
