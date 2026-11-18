import i18n from '../i18n';
import { Account, ActiveClientsStatus, DeviceProfile, DeviceProfiles, QuotaData } from '../types/account';
import { request as invoke } from '../utils/request';
import type { DashboardSnapshot } from '../utils/accountDashboard';
import type { OAuthLoginSession } from '../utils/oauthLoginFlow';

export async function listAccounts(): Promise<Account[]> {
    const response = await invoke<any>('list_accounts');
    if (response && typeof response === 'object' && Array.isArray(response.accounts)) {
        return response.accounts;
    }
    return response || [];
}

export async function getAccountDashboardSnapshot(): Promise<DashboardSnapshot> {
    return await invoke<DashboardSnapshot>('get_account_dashboard_snapshot');
}

export async function getCurrentAccount(targetIde?: string): Promise<Account | null> {
    return await invoke('get_current_account', { targetIde });
}

export async function getActiveClientsStatus(): Promise<ActiveClientsStatus> {
    return await invoke<ActiveClientsStatus>('get_active_clients_status');
}

export async function addAccount(email: string, refreshToken: string): Promise<Account> {
    return await invoke('add_account', { email, refreshToken });
}

export async function deleteAccount(accountId: string): Promise<void> {
    return await invoke('delete_account', { accountId });
}

export async function deleteAccounts(accountIds: string[]): Promise<void> {
    return await invoke('delete_accounts', { accountIds });
}

export async function switchAccount(accountId: string, targetIde?: string): Promise<void> {
    return await invoke('switch_account', { accountId, targetIde });
}

export async function fetchAccountQuota(accountId: string): Promise<QuotaData> {
    return await invoke('fetch_account_quota', { accountId });
}

export interface RefreshStats {
    total: number;
    success: number;
    failed: number;
    details: string[];
}

export async function refreshAllQuotas(): Promise<RefreshStats> {
    return await invoke('refresh_all_quotas');
}

export async function startOAuthLogin(oauthClientKey?: string): Promise<Account> {
    try {
        return await invoke('start_oauth_login', oauthClientKey ? { oauthClientKey } : undefined);
    } catch (error) {
        if (typeof error === 'string') {
            if (error.includes('Refresh Token') || error.includes('refresh_token')) {
                throw error;
            }
            throw i18n.t('accounts.add.oauth_error', { error });
        }
        throw error;
    }
}

export async function completeOAuthLogin(): Promise<Account> {
    return await invoke('complete_oauth_login');
}

export async function cancelOAuthLogin(flowId?: string): Promise<boolean> {
    return await invoke('cancel_oauth_login', { flowId });
}

export async function prepareOAuthLogin(): Promise<OAuthLoginSession> {
    return await invoke('prepare_oauth_login');
}

export async function openOAuthLogin(flowId: string): Promise<void> {
    return await invoke('open_oauth_login', { flowId });
}

export async function finishOAuthLogin(flowId: string): Promise<Account> {
    return await invoke('finish_oauth_login', { flowId });
}

export async function prepareOAuthUrl(oauthClientKey?: string): Promise<string> {
    return await invoke('prepare_oauth_url', oauthClientKey ? { oauthClientKey } : undefined);
}

export async function submitOAuthCode(code: string, state?: string, flowId?: string): Promise<void> {
    return await invoke('submit_oauth_code', { code, state, flowId });
}

export interface OAuthClientInfo {
    key: string;
    label: string;
    client_id: string;
    is_active: boolean;
    is_builtin: boolean;
}

export async function listOAuthClients(): Promise<OAuthClientInfo[]> {
    const res = await invoke<{ clients: OAuthClientInfo[] } | OAuthClientInfo[]>('list_oauth_clients');
    if (res && !Array.isArray(res) && Array.isArray(res.clients)) return res.clients;
    return (Array.isArray(res) ? res : []) as OAuthClientInfo[];
}

export async function getActiveOAuthClient(): Promise<string> {
    const res = await invoke<{ client_key: string } | string>('get_active_oauth_client');
    if (typeof res === 'string') return res;
    return res?.client_key || '';
}

export async function setActiveOAuthClient(clientKey: string): Promise<void> {
    return await invoke('set_active_oauth_client', { clientKey });
}

export async function importFromDb(targetIde?: string): Promise<Account[]> {
    const res = await invoke<any>('import_from_db', { targetIde });
    if (Array.isArray(res)) return res;
    return res ? [res] : [];
}

export async function importLocalAccountsReport(): Promise<{ accounts: Account[]; sources: { source: string; status: string }[] }> {
    return await invoke('import_local_accounts_report');
}

export interface AccountFileImportReport { imported: number; failed: number; }
export async function importFromCustomDb(path: string): Promise<AccountFileImportReport> {
    return await invoke('import_custom_db', { path });
}

export async function syncAccountFromDb(): Promise<Account | null> {
    return await invoke('sync_account_from_db');
}

export async function reorderAccounts(accountIds: string[]): Promise<void> {
    return await invoke('reorder_accounts', { accountIds });
}

export interface ExportAccountItem {
    email: string;
    refresh_token: string;
    name?: string;
    oauth_client_key?: string;
    is_gcp_tos?: boolean;
    project_id?: string;
    custom_label?: string;
}

export interface ExportAccountsResponse {
    schema_version?: number;
    accounts: ExportAccountItem[];
}

export async function exportAccounts(accountIds: string[]): Promise<ExportAccountsResponse> {
    return await invoke('export_accounts', { accountIds });
}

export async function saveAccountExport(accountIds: string[], path: string): Promise<number> {
    return await invoke('save_account_export', { accountIds, path });
}

export async function importAccountTransfer(item: ExportAccountItem): Promise<Account> {
    return await invoke('import_account_transfer', { item });
}

export async function updateAccountLabel(accountId: string, label: string): Promise<void> {
    return await invoke('update_account_label', { accountId, label });
}

export async function updateAccountPriority(accountId: string, priority: number): Promise<void> {
    return await invoke('update_account_priority', { accountId, priority });
}

export async function updateAccountProjectId(accountId: string, projectId: string | null): Promise<void> {
    return await invoke('update_account_project_id', { accountId, projectId });
}

export async function autoFetchAccountProjectId(accountId: string): Promise<string> {
    return await invoke('auto_fetch_account_project_id', { accountId });
}

export async function warmUpAccount(accountId: string): Promise<string> {
    return await invoke('warm_up_account', { accountId });
}

export async function warmUpAllAccounts(): Promise<string> {
    return await invoke('warm_up_all_accounts');
}

export async function getDeviceProfiles(accountId: string): Promise<DeviceProfiles> {
    return await invoke('get_device_profiles', { accountId });
}

export async function previewGenerateProfile(): Promise<DeviceProfile> {
    return await invoke('preview_generate_profile');
}

export async function bindDeviceProfile(accountId: string, mode: 'capture' | 'generate'): Promise<DeviceProfile> {
    return await invoke('bind_device_profile', { accountId, mode });
}

export async function bindDeviceProfileWithProfile(accountId: string, profile: DeviceProfile): Promise<DeviceProfile> {
    return await invoke('bind_device_profile_with_profile', { accountId, profile });
}

export async function restoreDeviceVersion(accountId: string, versionId: string): Promise<DeviceProfile> {
    return await invoke('restore_device_version', { accountId, versionId });
}

export async function deleteDeviceVersion(accountId: string, versionId: string): Promise<void> {
    return await invoke('delete_device_version', { accountId, versionId });
}

export async function applyDeviceProfile(accountId: string): Promise<DeviceProfile> {
    return await invoke('apply_device_profile', { accountId });
}

export async function restoreOriginalDevice(): Promise<string> {
    return await invoke('restore_original_device');
}

export async function openDeviceFolder(): Promise<void> {
    return await invoke('open_device_folder');
}
