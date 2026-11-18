import type { Account, ActiveClientsStatus, DeviceProfile, DeviceProfiles } from '../types/account';
import type { AutoSwitchConfig, AutoSwitchStatus } from '../types/autoSwitch';
import { DEFAULT_MENU_BAR_PREFERENCES, DEFAULT_QUOTA_VALUATION_CONFIG, type AppConfig } from '../types/config';

const nowSec = () => Math.floor(Date.now() / 1000);
const futureIso = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

const makeProfile = (seed: string): DeviceProfile => ({
  machine_id: `auth0|user_${seed.padEnd(32, 'a').slice(0, 32)}`,
  mac_machine_id: `8f2c${seed.slice(0, 4)}-4a1b-9c3d-${seed.slice(0, 12).padEnd(12, '0')}`,
  dev_device_id: `d4e8${seed.slice(0, 4)}-7c21-489a-b110-${seed.slice(0, 12).padEnd(12, '9')}`,
  sqm_id: `{${seed.toUpperCase().slice(0, 8)}-2F4A-4910-8C12-90ABCDEF1234}`,
});

const INITIAL_ACCOUNTS: Account[] = [
  {
    id: 'acc_ultra_1',
    email: 'alex.work@gmail.com',
    name: 'Alex Chen',
    priority: 10,
    custom_label: '主力 Ultra',
    token: {
      expires_in: 3600,
      expiry_timestamp: nowSec() + 3000,
      token_type: 'Bearer',
      email: 'alex.work@gmail.com',
      project_id: 'antigravity-prod-4410',
      is_gcp_tos: true,
    },
    device_profile: makeProfile('alex01'),
    device_history: [
      {
        id: 'ver_alex_1',
        created_at: nowSec() - 86400 * 6,
        label: 'generated',
        profile: makeProfile('alex01'),
        is_current: true,
      },
    ],
    quota: {
      last_updated: nowSec() - 120,
      subscription_tier: 'Google AI Ultra',
      quota_groups: [
        {
          display_name: 'Gemini Models',
          buckets: [
            { bucket_id: 'gemini-5h', window: '5h', remaining_fraction: 0.84, remaining_fraction_known: true, reset_time: futureIso(3.2) },
            { bucket_id: 'gemini-weekly', window: 'weekly', remaining_fraction: 0.68, remaining_fraction_known: true, reset_time: futureIso(108) },
          ],
        },
        {
          display_name: 'Claude and GPT models',
          buckets: [
            { bucket_id: '3p-5h', window: '5h', remaining_fraction: 0.76, remaining_fraction_known: true, reset_time: futureIso(2.7) },
            { bucket_id: '3p-weekly', window: 'weekly', remaining_fraction: 0.72, remaining_fraction_known: true, reset_time: futureIso(110) },
          ],
        },
        {
          display_name: 'Gemini 4 Argon',
          buckets: [
            { bucket_id: 'gemini-argon-wtu-weekly', window: 'weekly', remaining_fraction: 0.91, remaining_fraction_known: true, reset_time: futureIso(124) },
          ],
        },
        {
          display_name: 'Gemini 4 Carbon',
          buckets: [
            { bucket_id: 'gemini-carbon-5h', window: '5h', remaining_fraction: 0.88, remaining_fraction_known: true, reset_time: futureIso(4.1) },
            { bucket_id: 'gemini-carbon-wtu-weekly', window: 'weekly', remaining_fraction: 0.82, remaining_fraction_known: true, reset_time: futureIso(124) },
          ],
        },
      ],
      models: [
        { name: 'gemini-3-pro-high', display_name: 'Gemini 3 Pro (High)', percentage: 68, percentage_known: true, quota_bucket_id: 'gemini-weekly', observed_remaining_fraction: 0.84, reset_time: futureIso(3.2) },
        { name: 'gemini-3-flash', display_name: 'Gemini 3 Flash', percentage: 68, percentage_known: true, quota_bucket_id: 'gemini-weekly', observed_remaining_fraction: 0.84, reset_time: futureIso(3.2) },
        { name: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', percentage: 72, percentage_known: true, quota_bucket_id: '3p-weekly', observed_remaining_fraction: 0.76, reset_time: futureIso(2.7) },
        { name: 'gemini-4-argon-high', display_name: 'Gemini 4 Argon', percentage: 91, percentage_known: true, quota_bucket_id: 'gemini-argon-wtu-weekly', observed_remaining_fraction: 0.91, reset_time: futureIso(124) },
        { name: 'gemini-4-carbon-high', display_name: 'Gemini 4 Carbon', percentage: 82, percentage_known: true, quota_bucket_id: 'gemini-carbon-wtu-weekly', observed_remaining_fraction: 0.88, reset_time: futureIso(4.1) },
      ],
    },
    created_at: nowSec() - 86400 * 30,
    last_used: nowSec() - 300,
  },
  {
    id: 'acc_pro_expiring',
    email: 'lin.studio@gmail.com',
    name: 'Lin Studio',
    priority: 25,
    custom_label: '临期备用',
    token: {
      expires_in: 3600,
      expiry_timestamp: nowSec() + 3000,
      token_type: 'Bearer',
      email: 'lin.studio@gmail.com',
    },
    device_profile: makeProfile('lin02'),
    device_history: [],
    quota: {
      last_updated: nowSec() - 90,
      subscription_tier: 'Google AI Pro',
      quota_groups: [
        {
          display_name: 'Gemini Models',
          buckets: [
            { bucket_id: 'gemini-5h', window: '5h', remaining_fraction: 0.96, remaining_fraction_known: true, reset_time: futureIso(4.8) },
            { bucket_id: 'gemini-weekly', window: 'weekly', remaining_fraction: 0.44, remaining_fraction_known: true, reset_time: futureIso(5.4) },
          ],
        },
        {
          display_name: 'Claude and GPT models',
          buckets: [
            { bucket_id: '3p-5h', window: '5h', remaining_fraction: 0.92, remaining_fraction_known: true, reset_time: futureIso(4.5) },
            { bucket_id: '3p-weekly', window: 'weekly', remaining_fraction: 0.51, remaining_fraction_known: true, reset_time: futureIso(6.2) },
          ],
        },
      ],
      models: [
        { name: 'gemini-3-pro-high', display_name: 'Gemini 3 Pro (High)', percentage: 44, percentage_known: true, quota_bucket_id: 'gemini-weekly', observed_remaining_fraction: 0.96, reset_time: futureIso(4.8) },
        { name: 'gemini-3-flash', display_name: 'Gemini 3 Flash', percentage: 44, percentage_known: true, quota_bucket_id: 'gemini-weekly', observed_remaining_fraction: 0.96, reset_time: futureIso(4.8) },
        { name: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', percentage: 51, percentage_known: true, quota_bucket_id: '3p-weekly', observed_remaining_fraction: 0.92, reset_time: futureIso(4.5) },
      ],
    },
    created_at: nowSec() - 86400 * 18,
    last_used: nowSec() - 1800,
  },
  {
    id: 'acc_pro_low',
    email: 'dev.sandbox@workspace.dev',
    name: 'Dev Sandbox',
    priority: 50,
    custom_label: '测试号',
    token: {
      expires_in: 3600,
      expiry_timestamp: nowSec() + 3000,
      token_type: 'Bearer',
      email: 'dev.sandbox@workspace.dev',
    },
    device_profile: makeProfile('dev03'),
    device_history: [],
    quota: {
      last_updated: nowSec() - 180,
      subscription_tier: 'Google AI Pro',
      quota_groups: [
        {
          display_name: 'Gemini Models',
          buckets: [
            { bucket_id: 'gemini-5h', window: '5h', remaining_fraction: 0.14, remaining_fraction_known: true, reset_time: futureIso(1.1) },
            { bucket_id: 'gemini-weekly', window: 'weekly', remaining_fraction: 0.56, remaining_fraction_known: true, reset_time: futureIso(86) },
          ],
        },
        {
          display_name: 'Claude and GPT models',
          buckets: [
            { bucket_id: '3p-5h', window: '5h', remaining_fraction: 0.34, remaining_fraction_known: true, reset_time: futureIso(1.8) },
            { bucket_id: '3p-weekly', window: 'weekly', remaining_fraction: 0.62, remaining_fraction_known: true, reset_time: futureIso(86) },
          ],
        },
      ],
      models: [
        { name: 'gemini-3-pro-high', display_name: 'Gemini 3 Pro (High)', percentage: 14, percentage_known: true, quota_bucket_id: 'gemini-5h', observed_remaining_fraction: 0.14, reset_time: futureIso(1.1) },
        { name: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', percentage: 34, percentage_known: true, quota_bucket_id: '3p-5h', observed_remaining_fraction: 0.34, reset_time: futureIso(1.8) },
      ],
    },
    protected_models: ['gemini-3-pro-high'],
    created_at: nowSec() - 86400 * 12,
    last_used: nowSec() - 7200,
  },
  {
    id: 'acc_blocked',
    email: 'team.backup@gmail.com',
    name: 'Backup Verify',
    priority: 80,
    custom_label: '待验证',
    validation_blocked: true,
    validation_blocked_until: nowSec() + 1800,
    validation_blocked_reason: 'VALIDATION_REQUIRED: Please verify your account before continuing.',
    validation_url: 'https://accounts.google.com/signin/continue',
    token: {
      expires_in: 3600,
      expiry_timestamp: nowSec() + 3000,
      token_type: 'Bearer',
      email: 'team.backup@gmail.com',
    },
    quota: {
      last_updated: nowSec() - 600,
      subscription_tier: 'Antigravity',
      quota_groups: [],
      models: [],
    },
    created_at: nowSec() - 86400 * 45,
    last_used: nowSec() - 86400 * 3,
  },
];

let state = {
  accounts: structuredClone(INITIAL_ACCOUNTS),
  activeClients: {
    classic_source: 'running_app', ide_source: 'credentials', agy_source: 'credentials', observed_at: nowSec(),
    classic_account_id: 'acc_ultra_1',
    classic_email: 'alex.work@gmail.com',
    ide_account_id: 'acc_ultra_1',
    ide_email: 'alex.work@gmail.com',
    agy_account_id: 'acc_pro_expiring',
    agy_email: 'lin.studio@gmail.com',
  } as ActiveClientsStatus,
  baselineProfile: makeProfile('host00'),
  pinned: false,
  config: {
    language: 'zh',
    theme: 'light',
    check_updates_on_startup: false,
    auto_refresh: true,
    refresh_interval: 15,
    auto_sync: true,
    sync_interval: 5,
    network: { proxy_mode: 'system', proxy_url: '' },
    desktop: { launch_at_login: false, hide_dock_icon: false, start_minimized: false },
    menu_bar: { ...DEFAULT_MENU_BAR_PREFERENCES },
    quota_protection: {
      enabled: true,
      threshold_percentage: 20,
      monitored_models: ['claude', 'gemini-3-pro-high', 'gemini-3-flash'],
    },
    pinned_quota_models: { models: ['gemini-3-pro-high', 'gemini-3-flash', 'claude-sonnet-4-6'] },
    quota_valuation: { ...DEFAULT_QUOTA_VALUATION_CONFIG },
  } as AppConfig,
  autoSwitchConfig: {
    enabled: false,
    mode: 'wait',
    strategy: 'priority',
    reserve_percentage: 10,
    candidate_min_percentage: 30,
    monitored_model: 'all',
    candidate_account_ids: ['acc_ultra_1', 'acc_pro_expiring', 'acc_pro_low'],
    target: 'app_cli',
  } as AutoSwitchConfig,
  autoSwitchStatus: {
    phase: 'disabled',
    reason: null,
    source_account_id: null,
    source_email: null,
    target_account_id: null,
    target_email: null,
    remaining_percentage: null,
    pending_id: null,
    mode: 'wait',
    process_state: 'running',
    last_checked: nowSec(),
  } as AutoSwitchStatus,
};

function buildDayList() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    const base = 180_000 + ((i * 73121) % 340_000);
    const inp = Math.round(base * 0.42);
    const out = Math.round(base * 0.16);
    const cached = base - inp - out;
    days.push({
      date: key,
      input_tokens: inp,
      output_tokens: out,
      cached_tokens: cached,
      total_tokens: base,
      request_count: 14 + (i % 19),
    });
  }
  return days;
}

function buildHourlyList() {
  const hrs = [];
  const today = new Date().toISOString().slice(0, 10);
  for (let h = 0; h < 24; h++) {
    const active = h >= 8 && h <= 23;
    const total = active ? 18_000 + ((h * 9431) % 52_000) : 0;
    const inp = Math.round(total * 0.4);
    const out = Math.round(total * 0.17);
    const cached = total - inp - out;
    hrs.push({
      hour: `${today}T${String(h).padStart(2, '0')}:00:00`,
      input_tokens: inp,
      output_tokens: out,
      cached_tokens: cached,
      total_tokens: total,
      request_count: active ? 2 + (h % 5) : 0,
    });
  }
  return hrs;
}

const MODEL_USAGE = [
  { model: 'claude-sonnet-4-6', input_tokens: 185_000, output_tokens: 68_000, cached_tokens: 390_000, total_tokens: 643_000, request_count: 42 },
  { model: 'gemini-3-pro-high', input_tokens: 210_000, output_tokens: 74_000, cached_tokens: 280_000, total_tokens: 564_000, request_count: 38 },
  { model: 'gemini-3-flash', input_tokens: 142_000, output_tokens: 49_000, cached_tokens: 195_000, total_tokens: 386_000, request_count: 64 },
  { model: 'gemini-4-argon-high', input_tokens: 88_000, output_tokens: 31_000, cached_tokens: 112_000, total_tokens: 231_000, request_count: 18 },
];

// 预览只使用内存中的合成账号，不启动浏览器或访问真实 OAuth 服务。
let previewLogin: {
  id: string; url: string; claimed: boolean; settled: boolean;
  completion: Promise<Account>; resolve: (account: Account) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
} | undefined;

export async function previewMockRequest<T>(cmd: string, args: Record<string, any> = {}): Promise<T> {
  await new Promise((r) => setTimeout(r, 90));

  switch (cmd) {
    case 'list_accounts':
      return structuredClone(state.accounts) as T;
    case 'get_current_account': {
      const target = args.targetIde as string | undefined;
      const id =
        target === 'ide'
          ? state.activeClients.ide_account_id
          : target === 'agy'
            ? state.activeClients.agy_account_id
            : state.activeClients.classic_account_id;
      const acc = state.accounts.find((a) => a.id === id) || state.accounts[0] || null;
      return structuredClone(acc) as T;
    }
    case 'get_active_clients_status':
      return structuredClone(state.activeClients) as T;
    case 'switch_account': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      if (!acc) throw new Error('Account not found');
      acc.last_used = nowSec();
      const t = args.targetIde || 'app';
      if (t === 'ide') {
        state.activeClients.ide_account_id = acc.id;
        state.activeClients.ide_email = acc.email;
      } else if (t === 'agy') {
        state.activeClients.agy_account_id = acc.id;
        state.activeClients.agy_email = acc.email;
      } else if (t === 'all') {
        state.activeClients.classic_account_id = acc.id;
        state.activeClients.classic_email = acc.email;
        state.activeClients.ide_account_id = acc.id;
        state.activeClients.ide_email = acc.email;
        state.activeClients.agy_account_id = acc.id;
        state.activeClients.agy_email = acc.email;
      } else {
        state.activeClients.classic_account_id = acc.id;
        state.activeClients.classic_email = acc.email;
        state.activeClients.agy_account_id = acc.id;
        state.activeClients.agy_email = acc.email;
      }
      return undefined as T;
    }
    case 'add_account': {
      const email = args.email || `new_${Date.now()}@gmail.com`;
      const id = `acc_${Date.now()}`;
      const newAcc: Account = {
        id,
        email,
        name: email.split('@')[0],
        priority: 50,
        token: {
          expires_in: 3600,
          expiry_timestamp: nowSec() + 3600,
          token_type: 'Bearer',
          email,
        },
        device_profile: makeProfile(id.slice(-6)),
        device_history: [],
        quota: {
          last_updated: nowSec(),
          subscription_tier: 'Google AI Pro',
          quota_groups: [
            {
              display_name: 'Gemini Models',
              buckets: [
                { bucket_id: 'gemini-5h', window: '5h', remaining_fraction: 1.0, remaining_fraction_known: true, reset_time: futureIso(5) },
                { bucket_id: 'gemini-weekly', window: 'weekly', remaining_fraction: 1.0, remaining_fraction_known: true, reset_time: futureIso(168) },
              ],
            },
            {
              display_name: 'Claude and GPT models',
              buckets: [
                { bucket_id: '3p-5h', window: '5h', remaining_fraction: 1.0, remaining_fraction_known: true, reset_time: futureIso(5) },
                { bucket_id: '3p-weekly', window: 'weekly', remaining_fraction: 1.0, remaining_fraction_known: true, reset_time: futureIso(168) },
              ],
            },
          ],
          models: [
            { name: 'gemini-3-pro-high', display_name: 'Gemini 3 Pro (High)', percentage: 100, percentage_known: true, reset_time: futureIso(5) },
            { name: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', percentage: 100, percentage_known: true, reset_time: futureIso(5) },
          ],
        },
        created_at: nowSec(),
        last_used: nowSec(),
      };
      state.accounts.push(newAcc);
      return structuredClone(newAcc) as T;
    }
    case 'delete_account':
      state.accounts = state.accounts.filter((a) => a.id !== args.accountId);
      return undefined as T;
    case 'delete_accounts': {
      const set = new Set<string>(args.accountIds || []);
      state.accounts = state.accounts.filter((a) => !set.has(a.id));
      return undefined as T;
    }
    case 'reorder_accounts': {
      const order: string[] = args.accountIds || [];
      const map = new Map(state.accounts.map((a) => [a.id, a]));
      state.accounts = order.map((id) => map.get(id)).filter((a): a is Account => Boolean(a));
      return undefined as T;
    }
    case 'fetch_account_quota': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      if (acc?.quota) {
        acc.quota.last_updated = nowSec();
      }
      return structuredClone(acc?.quota) as T;
    }
    case 'refresh_all_quotas': {
      const ts = nowSec();
      state.accounts.forEach((a) => {
        if (a.quota) a.quota.last_updated = ts;
      });
      return { total: state.accounts.length, success: state.accounts.length, failed: 0, details: [] } as T;
    }
    case 'update_account_label': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      if (acc) acc.custom_label = args.label || undefined;
      return undefined as T;
    }
    case 'update_account_priority': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      if (acc) acc.priority = args.priority;
      return undefined as T;
    }
    case 'update_account_project_id': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      if (acc) acc.token.project_id = args.projectId || undefined;
      return undefined as T;
    }
    case 'auto_fetch_account_project_id': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      const pid = `antigravity-cloud-${Math.floor(1000 + Math.random() * 8999)}`;
      if (acc) acc.token.project_id = pid;
      return pid as T;
    }
    case 'warm_up_account': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      return `已对 ${acc?.email ?? '账号'} 完成轻量预热探测` as T;
    }
    case 'warm_up_all_accounts':
      return `已完成全部可用账号预热检测 (${state.accounts.filter((a) => !a.disabled && !a.validation_blocked).length} 个)` as T;
    case 'get_device_profiles':
    case 'list_device_versions': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      const res: DeviceProfiles = {
        current_storage: state.accounts[0]?.device_profile || state.baselineProfile,
        bound_profile: acc?.device_profile,
        history: acc?.device_history || [],
        baseline: state.baselineProfile,
      };
      return structuredClone(res) as T;
    }
    case 'preview_generate_profile':
      return makeProfile(Math.random().toString(16).slice(2, 10)) as T;
    case 'bind_device_profile': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      if (!acc) throw new Error('Account not found');
      const profile = args.mode === 'capture' ? state.baselineProfile : makeProfile(Math.random().toString(16).slice(2, 10));
      acc.device_profile = profile;
      acc.device_history = [
        ...(acc.device_history || []).map((v) => ({ ...v, is_current: false })),
        { id: `ver_${Date.now()}`, created_at: nowSec(), label: args.mode, profile, is_current: true },
      ];
      return structuredClone(profile) as T;
    }
    case 'bind_device_profile_with_profile': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      if (!acc) throw new Error('Account not found');
      acc.device_profile = args.profile;
      acc.device_history = [
        ...(acc.device_history || []).map((v) => ({ ...v, is_current: false })),
        { id: `ver_${Date.now()}`, created_at: nowSec(), label: 'generated', profile: args.profile, is_current: true },
      ];
      return structuredClone(args.profile) as T;
    }
    case 'restore_device_version': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      if (!acc) throw new Error('Account not found');
      const target =
        args.versionId === 'baseline'
          ? state.baselineProfile
          : acc.device_history?.find((v) => v.id === args.versionId)?.profile || state.baselineProfile;
      acc.device_profile = target;
      acc.device_history = (acc.device_history || []).map((v) => ({ ...v, is_current: v.id === args.versionId }));
      return structuredClone(target) as T;
    }
    case 'delete_device_version': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      if (acc?.device_history) {
        acc.device_history = acc.device_history.filter((v) => v.id !== args.versionId);
      }
      return undefined as T;
    }
    case 'apply_device_profile': {
      const acc = state.accounts.find((a) => a.id === args.accountId);
      return structuredClone(acc?.device_profile || state.baselineProfile) as T;
    }
    case 'restore_original_device':
      return '已还原全局基准设备指纹' as T;
    case 'load_config':
      return structuredClone(state.config) as T;
    case 'save_config':
      state.config = structuredClone(args.config);
      return undefined as T;
    case 'set_menu_bar_preferences':
      state.config.menu_bar = { ...state.config.menu_bar, ...(args.patch || {}), ...(args.quotaScope ? { quota_scope: args.quotaScope } : {}) };
      return structuredClone(state.config.menu_bar) as T;
    case 'set_desktop_preferences': {
      const p = (args.patch || args.preferences || {}) as Record<string, boolean>;
      state.config.desktop = {
        launch_at_login: false,
        hide_dock_icon: false,
        start_minimized: false,
        ...state.config.desktop,
        ...p,
      };
      return {
        platform: 'windows',
        tray_available: true,
        autostart_supported: false,
        launch_at_login: state.config.desktop.launch_at_login,
        hide_dock_icon: state.config.desktop.hide_dock_icon,
        start_minimized: state.config.desktop.start_minimized,
      } as T;
    }
    case 'get_desktop_settings': {
      const d = state.config.desktop ?? { launch_at_login: false, hide_dock_icon: false, start_minimized: false };
      return {
        platform: 'windows',
        tray_available: true,
        autostart_supported: false,
        launch_at_login: d.launch_at_login,
        hide_dock_icon: d.hide_dock_icon,
        start_minimized: d.start_minimized,
      } as T;
    }
    case 'get_auto_switch_config':
      return structuredClone(state.autoSwitchConfig) as T;
    case 'set_auto_switch_config':
      state.autoSwitchConfig = structuredClone(args.config);
      state.autoSwitchStatus = {
        ...state.autoSwitchStatus,
        phase: state.autoSwitchConfig.enabled ? 'monitoring' : 'disabled',
        mode: state.autoSwitchConfig.mode,
      };
      return structuredClone(state.autoSwitchConfig) as T;
    case 'get_auto_switch_status':
    case 'check_auto_switch_now':
      return structuredClone(state.autoSwitchStatus) as T;
    case 'cancel_auto_switch':
      state.autoSwitchStatus.phase = 'canceled';
      state.autoSwitchStatus.pending_id = null;
      return structuredClone(state.autoSwitchStatus) as T;
    case 'get_data_dir_path':
      return '~/.antigravity_tools' as T;
    case 'get_running_version':
      return '1.0.0' as T;
    case 'get_local_token_usage': {
      const daily = buildDayList();
      const hourly = buildHourlyList();
      const sumDays = (slice: typeof daily) =>
        slice.reduce(
          (acc, d) => ({
            input_tokens: acc.input_tokens + d.input_tokens,
            output_tokens: acc.output_tokens + d.output_tokens,
            cached_tokens: acc.cached_tokens + d.cached_tokens,
            total_tokens: acc.total_tokens + d.total_tokens,
            request_count: acc.request_count + d.request_count,
          }),
          { input_tokens: 0, output_tokens: 0, cached_tokens: 0, total_tokens: 0, request_count: 0 }
        );
      return {
        recent_performance: {
          model_count: 4,
          source_count: 2,
          sample_count: 10,
          first_text_seconds: 0.84,
          body_tokens_per_second: 78.6,
          last_activity: Date.now() - 45_000,
        },
        today: sumDays(daily.slice(-1)),
        yesterday: sumDays(daily.slice(-2, -1)),
        last_3_days: sumDays(daily.slice(-3)),
        last_7_days: sumDays(daily.slice(-7)),
        last_30_days: sumDays(daily),
        daily,
        hourly,
        by_model_today: MODEL_USAGE.map((m) => ({ ...m, input_tokens: Math.round(m.input_tokens * 0.16), output_tokens: Math.round(m.output_tokens * 0.16), cached_tokens: Math.round(m.cached_tokens * 0.16), total_tokens: Math.round(m.total_tokens * 0.16) })),
        by_model_yesterday: MODEL_USAGE.map((m) => ({ ...m, input_tokens: Math.round(m.input_tokens * 0.14), output_tokens: Math.round(m.output_tokens * 0.14), cached_tokens: Math.round(m.cached_tokens * 0.14), total_tokens: Math.round(m.total_tokens * 0.14) })),
        by_model_3_days: MODEL_USAGE.map((m) => ({ ...m, input_tokens: Math.round(m.input_tokens * 0.45), output_tokens: Math.round(m.output_tokens * 0.45), cached_tokens: Math.round(m.cached_tokens * 0.45), total_tokens: Math.round(m.total_tokens * 0.45) })),
        by_model_7_days: MODEL_USAGE,
        by_model: MODEL_USAGE.map((m) => ({ ...m, input_tokens: m.input_tokens * 4, output_tokens: m.output_tokens * 4, cached_tokens: m.cached_tokens * 4, total_tokens: m.total_tokens * 4, request_count: m.request_count * 4 })),
        databases_scanned: 3,
        generations_scanned: 162,
        skipped_large_records: 0,
        unreadable_databases: 0,
        last_activity: Date.now() - 45_000,
        generated_at: Date.now(),
      } as T;
    }
    case 'get_menu_bar_usage':
      return {
        today: { input_tokens: 185_000, output_tokens: 68_000, cached_tokens: 390_000, total_tokens: 643_000, request_count: 42 },
        estimated_usd: 2.34,
        unpriced_models: 0,
        pricing_stale: false,
        incomplete: false,
        performance: { sample_count: 10, first_text_seconds: 0.84, body_tokens_per_second: 78.6 },
      } as T;
    case 'get_api_pricing':
      return {
        prices: [
          { model: 'claude-sonnet-4-6', input: 3.0, output: 15.0, cached: 0.3 },
          { model: 'gemini-3-pro-high', input: 1.25, output: 10.0, cached: 0.3125 },
          { model: 'gemini-3-flash', input: 0.1, output: 0.4, cached: 0.025 },
          { model: 'gemini-4-argon-high', input: 1.5, output: 12.0, cached: 0.375 },
        ],
        fetched_at: Date.now(),
        stale: false,
        source: 'builtin',
      } as T;
    case 'get_account_quota_valuations':
      return {
        currency: state.config.quota_valuation?.currency ?? 'usd',
        display_mode: state.config.quota_valuation?.display_mode ?? 'remaining',
        usd_to_cny_rate: state.config.quota_valuation?.usd_to_cny_rate ?? 7.25,
        rate_stale: false,
        calculated_at: Date.now(),
        accounts: [
          {
            account_id: 'acc_ultra_1',
            email: 'alex.work@gmail.com',
            subscription_tier: 'Google AI Ultra',
            is_active: true,
            unpriced_events_count: 0,
            buckets: [
              { bucket_id: 'gemini-5h', window: '5h', pool: 'gemini', remaining_fraction: 0.84, reset_time: futureIso(3.2), provenance: 'observed', used_usd: 0.92, used_cny: 6.67, used_tokens: 182_000, estimated_total_usd: 5.74, estimated_total_cny: 41.6, estimated_remaining_usd: 4.82, estimated_remaining_cny: 34.9, estimated_total_tokens: 1_140_000, estimated_remaining_tokens: 958_000 },
              { bucket_id: 'gemini-weekly', window: 'weekly', pool: 'gemini', remaining_fraction: 0.68, reset_time: futureIso(108), provenance: 'observed', used_usd: 16.0, used_cny: 116.0, used_tokens: 2_850_000, estimated_total_usd: 50.0, estimated_total_cny: 362.5, estimated_remaining_usd: 34.0, estimated_remaining_cny: 246.5, estimated_total_tokens: 8_900_000, estimated_remaining_tokens: 6_050_000 },
              { bucket_id: '3p-5h', window: '5h', pool: 'third_party', remaining_fraction: 0.76, reset_time: futureIso(2.7), provenance: 'observed', used_usd: 1.3, used_cny: 9.42, used_tokens: 145_000, estimated_total_usd: 5.4, estimated_total_cny: 39.15, estimated_remaining_usd: 4.1, estimated_remaining_cny: 29.7, estimated_total_tokens: 604_000, estimated_remaining_tokens: 459_000 },
              { bucket_id: '3p-weekly', window: 'weekly', pool: 'third_party', remaining_fraction: 0.72, reset_time: futureIso(110), provenance: 'observed', used_usd: 11.2, used_cny: 81.2, used_tokens: 1_240_000, estimated_total_usd: 40.0, estimated_total_cny: 290.0, estimated_remaining_usd: 28.8, estimated_remaining_cny: 208.8, estimated_total_tokens: 4_428_000, estimated_remaining_tokens: 3_188_000 },
            ],
          },
          {
            account_id: 'acc_pro_expiring',
            email: 'lin.studio@gmail.com',
            subscription_tier: 'Google AI Pro',
            is_active: false,
            unpriced_events_count: 0,
            buckets: [
              { bucket_id: 'gemini-5h', window: '5h', pool: 'gemini', remaining_fraction: 0.96, reset_time: futureIso(4.5), provenance: 'observed', used_usd: 0.1, used_cny: 0.73, used_tokens: 24_000, estimated_total_usd: 2.5, estimated_total_cny: 18.1, estimated_remaining_usd: 2.4, estimated_remaining_cny: 17.4, estimated_total_tokens: 600_000, estimated_remaining_tokens: 576_000 },
              { bucket_id: 'gemini-weekly', window: 'weekly', pool: 'gemini', remaining_fraction: 0.44, reset_time: futureIso(11), provenance: 'observed', used_usd: 14.0, used_cny: 101.5, used_tokens: 2_210_000, estimated_total_usd: 25.0, estimated_total_cny: 181.25, estimated_remaining_usd: 11.0, estimated_remaining_cny: 79.75, estimated_total_tokens: 3_946_000, estimated_remaining_tokens: 1_736_000 },
              { bucket_id: '3p-5h', window: '5h', pool: 'third_party', remaining_fraction: 0.92, reset_time: futureIso(3.9), provenance: 'observed', used_usd: 0.2, used_cny: 1.45, used_tokens: 31_000, estimated_total_usd: 2.5, estimated_total_cny: 18.1, estimated_remaining_usd: 2.3, estimated_remaining_cny: 16.65, estimated_total_tokens: 387_000, estimated_remaining_tokens: 356_000 },
              { bucket_id: '3p-weekly', window: 'weekly', pool: 'third_party', remaining_fraction: 0.51, reset_time: futureIso(14), provenance: 'observed', used_usd: 9.8, used_cny: 71.0, used_tokens: 980_000, estimated_total_usd: 20.0, estimated_total_cny: 145.0, estimated_remaining_usd: 10.2, estimated_remaining_cny: 73.95, estimated_total_tokens: 2_000_000, estimated_remaining_tokens: 1_020_000 },
            ],
          },
        ],
      } as T;
    case 'get_menu_bar_snapshot':
    case 'get_account_dashboard_snapshot':
      return {
        indexed_total: state.accounts.length,
        loaded_count: state.accounts.length,
        failed_count: 0,
        current_account_id: state.activeClients.classic_account_id,
        current_identity_source: 'running_app',
        accounts: state.accounts.map((a) => ({
          id: a.id,
          email: a.email,
          name: a.name ?? null,
          custom_label: a.custom_label ?? null,
          read_status: 'loaded',
          read_error: null,
          disabled: Boolean(a.disabled),
          validation_blocked: Boolean(a.validation_blocked),
          validation_blocked_until: a.validation_blocked_until ?? null,
          protected_models: a.protected_models || [],
          quota: a.quota
            ? {
                last_updated: a.quota.last_updated,
                is_forbidden: Boolean(a.quota.is_forbidden),
                subscription_tier: a.quota.subscription_tier ?? null,
                provenance: 'observed',
                models: a.quota.models.map((m) => ({
                  name: m.name,
                  display_name: m.display_name ?? null,
                  percentage: m.percentage ?? null,
                  reset_time: m.reset_time,
                  inferred_bucket_id: m.quota_bucket_id ?? null,
                })),
                groups:
                  a.quota.quota_groups?.map((g) => ({
                    display_name: g.display_name,
                    buckets: g.buckets.map((b) => ({
                      bucket_id: b.bucket_id,
                      window: b.window,
                      remaining_fraction: b.remaining_fraction,
                      reset_time: b.reset_time,
                    })),
                  })) ?? null,
              }
            : null,
        })),
      } as T;
    case 'set_menu_bar_pinned':
      state.pinned = Boolean(args.pinned);
      return undefined as T;
    case 'is_menu_bar_pinned':
      return state.pinned as T;
    case 'export_accounts': {
      const ids = new Set<string>(args.accountIds || []);
      return {
        schema_version: 2,
        accounts: state.accounts
          .filter((a) => !ids.size || ids.has(a.id))
          .map((a) => ({
            email: a.email,
            refresh_token: `1//preview_${a.id}`,
            name: a.name,
            custom_label: a.custom_label,
          })),
      } as T;
    }
    case 'check_for_updates':
      return { enabled: false, current_version: '1.0.0', latest_version: '1.0.0', has_update: false, release_url: '' } as T;
    case 'get_app_experiments':
      return { translation_enabled: false, supported: true } as T;
    case 'set_app_translation':
      return { translation_enabled: Boolean(args.enabled), supported: true } as T;
    case 'list_oauth_clients':
      return [{ key: 'antigravity', label: 'Antigravity OAuth', client_id: 'default', is_active: true, is_builtin: true }] as T;
    case 'get_active_oauth_client':
      return 'antigravity' as T;
    case 'prepare_oauth_url':
      return 'https://accounts.google.com/o/oauth2/v2/auth?preview=1' as T;
    case 'prepare_oauth_login': {
      if (previewLogin) { clearTimeout(previewLogin.timer); previewLogin.reject(new Error('OAuth cancelled')); }
      const id = crypto.randomUUID();
      let resolve!: (account: Account) => void;
      let reject!: (error: Error) => void;
      const completion = new Promise<Account>((done, fail) => { resolve = done; reject = fail; });
      void completion.catch(() => {});
      const url = `https://example.invalid/preview-oauth?state=${id}`;
      const timer = setTimeout(() => {
        reject(new Error('授权已超时，请重新开始。'));
        if (previewLogin?.id === id) previewLogin = undefined;
      }, 300_000);
      previewLogin = { id, url, claimed: false, settled: false, completion, resolve, reject, timer };
      return { flow_id: id, auth_url: url, expires_in: 300 } as T;
    }
    case 'open_oauth_login':
      if (previewLogin?.id !== args.flowId) throw new Error('本次授权已失效。');
      return undefined as T;
    case 'finish_oauth_login': {
      const flow = previewLogin;
      if (!flow || flow.id !== args.flowId || flow.claimed) throw new Error('本次授权已失效或已在等待。');
      flow.claimed = true;
      try { return await flow.completion as T; }
      finally { if (previewLogin === flow) previewLogin = undefined; clearTimeout(flow.timer); }
    }
    case 'cancel_oauth_login': {
      const flow = previewLogin;
      if (!flow || flow.settled || (args.flowId && flow.id !== args.flowId)) return false as T;
      previewLogin = undefined;
      clearTimeout(flow.timer);
      flow.reject(new Error('OAuth cancelled'));
      return true as T;
    }
    case 'submit_oauth_code': {
      const flow = previewLogin;
      if (!flow || flow.id !== args.flowId || flow.settled) throw new Error('本次授权已失效。');
      if (args.code !== 'preview-code') throw new Error('预览模式请使用 preview-code，不接受真实授权信息。');
      const email = 'preview-login@example.com';
      const account: Account = {
        id: 'preview-oauth-account', email, name: '授权预览账号', priority: 50,
        token: { expires_in: 3600, expiry_timestamp: nowSec() + 3600, token_type: 'Bearer', email },
        created_at: nowSec(), last_used: nowSec(),
      };
      state.accounts = [...state.accounts.filter((item) => item.id !== account.id), account];
      flow.settled = true;
      flow.resolve(structuredClone(account));
      return undefined as T;
    }
    default:
      return undefined as T;
  }
}
