export interface Account {
    id: string;
    email: string;
    name?: string;
    priority?: number;
    token: TokenData;
    device_profile?: DeviceProfile;
    device_history?: DeviceProfileVersion[];
    quota?: QuotaData;
    disabled?: boolean;
    disabled_reason?: string;
    disabled_at?: number;
    protected_models?: string[];
    custom_label?: string;
    validation_blocked?: boolean;
    validation_blocked_until?: number;
    validation_blocked_reason?: string;
    validation_url?: string;
    created_at: number;
    last_used: number;
}

export interface TokenData {
    expires_in: number;
    expiry_timestamp: number;
    token_type: string;
    email?: string;
    project_id?: string;
    is_gcp_tos?: boolean;
    oauth_client_key?: string;
}

export interface QuotaData {
    models: ModelQuota[];
    model_catalog_known?: boolean;
    last_updated: number;
    is_forbidden?: boolean;
    forbidden_reason?: string;
    subscription_tier?: string;
    model_forwarding_rules?: Record<string, string>;
    quota_groups?: QuotaGroup[];
}

export interface ModelQuota {
    name: string;
    percentage: number;
    percentage_known?: boolean;
    quota_bucket_id?: string;
    observed_remaining_fraction?: number;
    primary_quota?: { remaining_fraction: number | null; reset_time: string };
    reset_time: string;
    display_name?: string;
    supports_images?: boolean;
    supports_thinking?: boolean;
    thinking_budget?: number;
    recommended?: boolean;
    max_tokens?: number;
    max_output_tokens?: number;
    supported_mime_types?: Record<string, boolean>;
}

export interface QuotaBucket {
    bucket_id: string;
    window: string;
    remaining_fraction: number;
    remaining_fraction_known?: boolean;
    reset_time: string;
    display_name?: string;
    description?: string;
}

export interface QuotaGroup {
    display_name: string;
    description?: string;
    buckets: QuotaBucket[];
}

export interface DeviceProfile {
    machine_id: string;
    mac_machine_id?: string;
    dev_device_id: string;
    sqm_id: string;
}

export interface DeviceProfileVersion {
    id: string;
    created_at: number;
    label: string;
    profile: DeviceProfile;
    is_current?: boolean;
}

export interface DeviceProfiles {
    current_storage?: DeviceProfile;
    bound_profile?: DeviceProfile;
    history: DeviceProfileVersion[];
    baseline?: DeviceProfile;
}

export interface ActiveClientsStatus {
    classic_account_id?: string | null;
    classic_email?: string | null;
    ide_account_id?: string | null;
    ide_email?: string | null;
    agy_account_id?: string | null;
    agy_email?: string | null;
    classic_source: 'running_app' | 'credentials' | 'unavailable';
    ide_source: 'running_app' | 'credentials' | 'unavailable';
    agy_source: 'running_app' | 'credentials' | 'unavailable';
    observed_at: number;
}

export type ClientTarget = 'app' | 'classic' | 'ide' | 'agy' | 'vscode' | 'all';
