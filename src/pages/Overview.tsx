import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  CaretDown,
  ClockCountdown,
  Code,
  Fire,
  Laptop,
  RocketLaunch,
  Sparkle,
  TerminalWindow,
  WarningCircle,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAccountStore } from '../stores/useAccountStore';
import { useConfigStore } from '../stores/useConfigStore';
import { reconcileAppSignIn } from '../services/accountService';
import * as configService from '../services/configService';
import { isAntigravityProxyEnabled, resolveAntigravityProxyUrl } from '../types/config';
import { getAccountTier } from '../utils/accountTier';
import { AccountTierBadge } from '../components/accounts/AccountTierBadge';
import {
  extractPoolWindow,
  findBestRecommendation,
  findExpiringAccounts,
  formatShortCountdown,
} from '../utils/accountInsights';
import {
  aggregateArgon,
  aggregateCarbon,
  aggregateMenuBar,
  menuBarAccount,
  quotaDisplay,
} from '../utils/menuBarOverview';
import type { DashboardAccount } from '../utils/accountDashboard';
import { estimateApiCost } from '../utils/modelPricing';
import { formatUsdWithRate } from '../utils/currency';
import { request } from '../utils/request';
import { SpringSegmentedControl } from '../components/motion/SpringSegmentedControl';
import { MorphActionButton } from '../components/motion/MorphActionButton';
import { BlurNumber } from '../components/motion/BlurNumber';
import { SpringMeter } from '../components/motion/SpringMeter';
import { TriLinkedRingChart } from '../components/motion/TriLinkedRingChart';
import { SpringAccordion } from '../components/motion/SpringAccordion';
import { WaveRevealContainer } from '../components/motion/WaveRevealContainer';
import { showToast } from '../components/motion/SpringToast';
import type { Account } from '../types/account';

import { clientIdentity } from '../utils/clientIdentity';

type ClientTab = 'classic' | 'ide' | 'agy';
type RangeKey = 'today' | '3d' | '7d' | '30d';
type QuotaWindowKey = '5h' | 'weekly';

interface LocalTokenTotals {
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  request_count: number;
}

interface LocalTokenUsageSummary {
  recent_performance?: {
    model_count: number;
    source_count: number;
    sample_count: number;
    first_text_seconds: number;
    body_tokens_per_second: number;
    last_activity: number;
  } | null;
  today: LocalTokenTotals;
  last_3_days: LocalTokenTotals;
  last_7_days: LocalTokenTotals;
  last_30_days: LocalTokenTotals;
  by_model_today: (LocalTokenTotals & { model: string })[];
  by_model_3_days: (LocalTokenTotals & { model: string })[];
  by_model_7_days: (LocalTokenTotals & { model: string })[];
  by_model: (LocalTokenTotals & { model: string })[];
}

interface ApiPricingSnapshot {
  prices: { model: string; input: number; output: number; cached: number }[];
}

const compactTokens = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
};

function toDashboardAccount(a: Account): DashboardAccount {
  return {
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
                remaining_fraction: b.remaining_fraction_known === false ? null : b.remaining_fraction,
                reset_time: b.reset_time,
              })),
            })) ?? null,
        }
      : null,
  };
}

function MeterBar({ value }: { value: number | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  const color =
    value === null
      ? 'bg-[var(--border-strong)]'
      : pct > 60
        ? 'bg-[var(--emerald)]'
        : pct >= 20
          ? 'bg-[var(--amber)]'
          : 'bg-[var(--rose)]';
  return (
    <SpringMeter
      value={value === null ? null : pct}
      fillClassName={color}
      className="h-[7px] w-full bg-[var(--surface)] transition-[height] duration-200 group-hover/meter:h-[9px]"
    />
  );
}

export default function Overview() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const navigate = useNavigate();
  const {
    accounts,
    activeClients,
    fetchAccounts,
    switchAccount,
    refreshQuota,
    warmUpAccount,
  } = useAccountStore();
  const config = useConfigStore((s) => s.config);

  const [clientTab, setClientTab] = useState<ClientTab>('classic');
  const [poolWindow, setPoolWindow] = useState<QuotaWindowKey>('5h');
  const [usageRange, setUsageRange] = useState<RangeKey>('today');
  const [showAllExpiring, setShowAllExpiring] = useState(false);
  const [refreshWaveKey, setRefreshWaveKey] = useState(0);
  const [usage, setUsage] = useState<LocalTokenUsageSummary | null>(null);
  const [pricing, setPricing] = useState<ApiPricingSnapshot | null>(null);
  const [appSignInBusy, setAppSignInBusy] = useState(false);
  const [desktopPlatform, setDesktopPlatform] = useState<string | null>(null);
  const [launchingClient, setLaunchingClient] = useState(false);
  const switchingRef = useRef(false);

  const loadTelemetry = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([
        request<LocalTokenUsageSummary>('get_local_token_usage').catch(() => null),
        request<ApiPricingSnapshot>('get_api_pricing').catch(() => null),
      ]);
      if (u) setUsage(u);
      if (p) setPricing(p);
    } catch {
      // Telemetry is optional on startup
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
    void loadTelemetry();
    void configService
      .getDesktopSettings()
      .then((ds) => setDesktopPlatform(ds.platform))
      .catch(() => null);
  }, [fetchAccounts, loadTelemetry]);

  const isWindowsPlatform = desktopPlatform === 'windows';
  const clientProxyUrl = resolveAntigravityProxyUrl(config?.network);
  const clientProxyEnabled = isAntigravityProxyEnabled(config?.network);

  const handleLaunchClientProxy = async () => {
    if (launchingClient) return;
    setLaunchingClient(true);
    try {
      await configService.launchAntigravityWithProxy();
      showToast(zh ? '正在以免 TUN 模式启动 Antigravity' : 'Launching Antigravity without TUN', 'success');
    } catch (error) {
      const message = String(error);
      if (message === 'client_proxy_app_running') {
        showToast(
          zh
            ? 'Antigravity 正在运行。请先完全退出客户端，再点一次「免 TUN 启动」。'
            : 'Antigravity is already running. Quit it completely, then click Launch again.',
          'info'
        );
      } else if (message === 'client_proxy_off') {
        showToast(
          zh ? '请先在设置中填写代理端口并开启免 TUN。' : 'Enable Antigravity No-TUN in Settings first.',
          'info'
        );
        navigate('/settings?section=client_network');
      } else {
        showToast(message, 'error');
      }
    } finally {
      setLaunchingClient(false);
    }
  };

  const activeIdentity = clientIdentity(activeClients, clientTab);
  const activeClientId = activeIdentity.accountId;
  const canSyncAppSignIn = clientTab === 'classic' && activeIdentity.unmatchedSignIn;

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeClientId) || null,
    [accounts, activeClientId]
  );

  const activeTier = activeAccount ? getAccountTier(activeAccount) : 'unknown';
  const recommendation = useMemo(
    () => findBestRecommendation(accounts, activeAccount?.id),
    [accounts, activeAccount?.id]
  );
  const expiringList = useMemo(() => findExpiringAccounts(accounts), [accounts]);

  // Aggregate quota metrics
  const poolStats = useMemo(() => {
    const now = Date.now();
    const views = accounts.map((a) => menuBarAccount(toDashboardAccount(a), now, config?.refresh_interval));
    const gemini = aggregateMenuBar(views, 'gemini', poolWindow, 10);
    const other = aggregateMenuBar(views, 'other', poolWindow, 10);
    const argon = aggregateArgon(views);
    const carbon = aggregateCarbon(views);
    return { gemini, other, argon, carbon, totalAccounts: accounts.length };
  }, [accounts, poolWindow, config?.refresh_interval]);

  // Usage & Cost metrics
  const usageMetrics = useMemo(() => {
    const totals = !usage
      ? { input_tokens: 0, output_tokens: 0, cached_tokens: 0, total_tokens: 0, request_count: 0 }
      : usageRange === 'today'
        ? usage.today
        : usageRange === '3d'
          ? usage.last_3_days
          : usageRange === '7d'
            ? usage.last_7_days
            : usage.last_30_days;

    const models = !usage
      ? []
      : usageRange === 'today'
        ? usage.by_model_today
        : usageRange === '3d'
          ? usage.by_model_3_days
          : usageRange === '7d'
            ? usage.by_model_7_days
            : usage.by_model;

    const costUsd = pricing?.prices?.length ? estimateApiCost(models, pricing).usd : 0;

    const currencyMode = config?.quota_valuation?.currency ?? 'usd';
    const rate = config?.quota_valuation?.usd_to_cny_rate ?? 7.25;
    const formattedCost =
      currencyMode === 'usd'
        ? costUsd === 0
          ? '$0.00'
          : `$${costUsd.toFixed(2)}`
        : formatUsdWithRate(costUsd, currencyMode, rate, true);

    return { totals, formattedCost, perf: usage?.recent_performance };
  }, [usage, usageRange, pricing, config?.quota_valuation]);

  const handleSwitchTarget = async (accountId: string) => {
    if (switchingRef.current) {
      throw new Error(zh ? '正在切换账号，请稍候' : 'An account switch is already in progress');
    }
    switchingRef.current = true;
    const target = clientTab === 'classic' ? 'app' : clientTab;
    try {
      await switchAccount(accountId, target);
      const email = accounts.find((a) => a.id === accountId)?.email ?? '';
      const clientName = clientTab === 'classic' ? 'App' : clientTab === 'ide' ? 'IDE' : 'CLI';
      showToast(
        zh ? `${clientName} 已切换到 ${email}` : `Switched ${clientName} to ${email}`,
        'success'
      );
    } catch (error) {
      const raw = String(error);
      const friendly = raw.includes('another_account_switch_in_progress')
        ? (zh ? '已有账号操作正在进行，请稍后重试。' : 'Another account operation is in progress.')
        : raw.includes('oauth_client_not_configured')
          ? (zh ? '未配置本地 Google OAuth 客户端，请先配置 google-oauth.json 或环境变量。' : 'Local Google OAuth client is not configured.')
          : raw;
      showToast(friendly, 'error');
      throw error;
    } finally {
      switchingRef.current = false;
    }
  };

  const handleSyncAppSignIn = async () => {
    if (appSignInBusy) return;
    setAppSignInBusy(true);
    try {
      await reconcileAppSignIn();
      await fetchAccounts();
      const identity = clientIdentity(useAccountStore.getState().activeClients, 'classic');
      if (identity.accountId) {
        showToast(zh ? '已匹配 App 登录账号' : 'App sign-in matched', 'success');
      } else {
        showToast(zh ? '同步后仍未匹配 App 登录，请检查 Antigravity 中的账号。'
          : 'The App sign-in is still unmatched. Check the account in Antigravity.', 'info');
      }
    } catch (error) {
      const messages: Record<string, string> = {
        app_sign_in_unavailable: zh ? '暂时读不到 App 的本机登录。' : 'The App sign-in is currently unavailable.',
        app_sign_in_changed: zh ? 'App 登录状态已变化，请重试。' : 'The App sign-in changed. Try again.',
        app_sign_in_ambiguous: zh ? '本机登录匹配多条记录，请在账号列表中核对。'
          : 'The local sign-in matches multiple records. Check the Accounts list.',
        app_sign_in_oauth_unavailable: zh ? 'AgyFlux 尚未配置用于验证的 Google OAuth 客户端。'
          : 'AgyFlux needs a Google OAuth client to verify this sign-in.',
        another_account_switch_in_progress: zh ? '已有账号操作正在进行，请稍后重试。'
          : 'Another account operation is in progress. Try again shortly.',
      };
      showToast(messages[String(error)] ?? (zh ? '同步失败，请检查 Google 登录和代理连接。'
        : 'Sign-in sync failed. Check your Google sign-in and proxy connection.'), 'error');
    } finally {
      setAppSignInBusy(false);
    }
  };

  const activeGemini5h = activeAccount ? extractPoolWindow(activeAccount, 'gemini', '5h') : null;
  const activeGeminiWeek = activeAccount ? extractPoolWindow(activeAccount, 'gemini', 'weekly') : null;
  const activeOther5h = activeAccount ? extractPoolWindow(activeAccount, 'other', '5h') : null;
  const activeOtherWeek = activeAccount ? extractPoolWindow(activeAccount, 'other', 'weekly') : null;
  const activeArgon = activeAccount ? extractPoolWindow(activeAccount, 'argon', 'weekly') : null;
  const activeCarbonWeek = activeAccount ? extractPoolWindow(activeAccount, 'carbon', 'weekly') : null;

  return (
    <div className="space-y-5">
      {/* Row 1: Active Client & Smart Recommendation */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Card 1: Current Active Client */}
        <section
          style={{ '--stagger-index': 0 } as React.CSSProperties}
          className="mk-stagger lg:col-span-7 elevated-card elevated-card-hover flex h-full flex-col justify-between rounded-[28px] p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                {activeIdentity.source === 'running_app' && (
                  <span className="status-ping-ring absolute inset-0 rounded-full bg-[var(--emerald)]" />
                )}
                <span className={`relative h-2 w-2 rounded-full ${activeIdentity.source === 'unavailable' || activeIdentity.unmatchedSignIn ? 'bg-[var(--ink-muted)]' : 'bg-[var(--emerald)]'}`} />
              </span>
              <h2 className="text-sm font-semibold text-[var(--ink)]">
                {activeIdentity.source === 'running_app'
                  ? (zh ? '当前运行账号' : 'Running Account')
                  : activeIdentity.unmatchedSignIn
                    ? (zh ? '本机登录待匹配' : 'Local Sign-in Unmatched')
                    : activeIdentity.source === 'credentials'
                      ? (zh ? '已保存登录账号' : 'Saved Sign-in')
                      : (zh ? '客户端账号未确认' : 'Account Unconfirmed')}
              </h2>
            </div>

            <SpringSegmentedControl
              size="sm"
              value={clientTab}
              onChange={setClientTab}
              ariaLabel="客户端选择"
              options={[
                { value: 'classic', label: 'App' },
                { value: 'ide', label: 'IDE' },
                { value: 'agy', label: 'CLI' },
              ]}
            />
          </div>

          {activeAccount ? (
            <div key={clientTab} className="mk-capsule-switch mt-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-secondary)]">
                      {clientTab === 'classic' ? (
                        <Laptop size={14} weight="bold" />
                      ) : clientTab === 'ide' ? (
                        <Code size={14} weight="bold" />
                      ) : (
                        <TerminalWindow size={14} weight="bold" />
                      )}
                    </span>
                    <div
                      key={activeAccount.id}
                      className="mk-capsule-switch flex min-w-0 flex-wrap items-center gap-2"
                    >
                      <span className="truncate text-base font-semibold tracking-tight text-[var(--ink)]">
                        {activeAccount.email}
                      </span>
                      <AccountTierBadge tier={activeTier} subscription={activeAccount.quota?.subscription_tier} />
                      {activeAccount.custom_label && (
                        <span className="inline-flex items-center rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-secondary)]">
                          {activeAccount.custom_label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {clientTab === 'classic' && isWindowsPlatform && (
                    clientProxyEnabled ? (
                      <button
                        type="button"
                        disabled={launchingClient}
                        onClick={() => void handleLaunchClientProxy()}
                        title={
                          zh
                            ? `以免 TUN 模式启动 Antigravity（${clientProxyUrl}）`
                            : `Launch Antigravity without TUN (${clientProxyUrl})`
                        }
                        className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-3.5 text-xs font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)] disabled:opacity-50"
                      >
                        <RocketLaunch size={13} weight="bold" />
                        <span>
                          {launchingClient ? (zh ? '启动中…' : 'Launching…') : (zh ? '免 TUN 启动' : 'No-TUN Launch')}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate('/settings?section=client_network')}
                        title={zh ? '配置 Antigravity 免 TUN 启动' : 'Configure Antigravity No-TUN launch'}
                        className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
                      >
                        <RocketLaunch size={13} weight="bold" />
                        <span>{zh ? '免 TUN' : 'No-TUN'}</span>
                      </button>
                    )
                  )}
                  <MorphActionButton
                    size="sm"
                    variant="secondary"
                    icon={<ArrowsClockwise size={13} weight="bold" />}
                    idleLabel={zh ? '刷新' : 'Refresh'}
                    loadingLabel={zh ? '同步中' : 'Sync'}
                    successLabel={zh ? '已更新' : 'Updated'}
                    onClick={async () => {
                      await refreshQuota(activeAccount.id);
                      setRefreshWaveKey((k) => k + 1);
                      showToast(zh ? '额度已刷新' : 'Quota refreshed', 'success');
                    }}
                  />
                  <MorphActionButton
                    size="sm"
                    variant="secondary"
                    icon={<Fire size={13} weight="bold" />}
                    idleLabel={zh ? '预热' : 'Warmup'}
                    loadingLabel={zh ? '探测中' : 'Ping'}
                    successLabel={zh ? '正常' : 'Ready'}
                    onClick={async () => {
                      const msg = await warmUpAccount(activeAccount.id);
                      showToast(msg, 'success');
                    }}
                  />
                </div>
              </div>

              {/* Compact 5H + Weekly Dual-Window Quota Cards */}
              <WaveRevealContainer waveKey={refreshWaveKey} className="rounded-[20px]">
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Gemini 5H + Weekly */}
                  <div className="rounded-[20px] bg-[var(--surface-soft)] p-4 space-y-3">
                    <div className="text-xs font-semibold text-[var(--ink)]">Gemini</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="group/meter min-w-0">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-[var(--ink-secondary)]">5H</span>
                          <BlurNumber
                            mode="odometer"
                            value={quotaDisplay(activeGemini5h?.remaining ?? null)}
                            className="font-mono font-semibold text-[var(--ink)]"
                          />
                        </div>
                        <div className="mt-1.5">
                          <MeterBar value={activeGemini5h?.remaining ?? null} />
                        </div>
                        <div className="mt-1 truncate text-[10px] font-mono text-[var(--ink-muted)]">
                          {activeGemini5h?.resetTime
                            ? `${formatShortCountdown(activeGemini5h.resetTime)} ${zh ? '重置' : 'reset'}`
                            : '—'}
                        </div>
                      </div>

                      <div className="group/meter min-w-0">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-[var(--ink-secondary)]">
                            {zh ? '周额度' : 'Weekly'}
                          </span>
                          <BlurNumber
                            mode="odometer"
                            value={quotaDisplay(activeGeminiWeek?.remaining ?? null)}
                            className="font-mono font-semibold text-[var(--ink)]"
                          />
                        </div>
                        <div className="mt-1.5">
                          <MeterBar value={activeGeminiWeek?.remaining ?? null} />
                        </div>
                        <div className="mt-1 truncate text-[10px] font-mono text-[var(--ink-muted)]">
                          {activeGeminiWeek?.resetTime
                            ? `${formatShortCountdown(activeGeminiWeek.resetTime)} ${zh ? '重置' : 'reset'}`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Claude / GPT 5H + Weekly */}
                  <div className="rounded-[20px] bg-[var(--surface-soft)] p-4 space-y-3">
                    <div className="text-xs font-semibold text-[var(--ink)]">Claude / GPT</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="group/meter min-w-0">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-[var(--ink-secondary)]">5H</span>
                          <BlurNumber
                            mode="odometer"
                            value={quotaDisplay(activeOther5h?.remaining ?? null)}
                            className="font-mono font-semibold text-[var(--ink)]"
                          />
                        </div>
                        <div className="mt-1.5">
                          <MeterBar value={activeOther5h?.remaining ?? null} />
                        </div>
                        <div className="mt-1 truncate text-[10px] font-mono text-[var(--ink-muted)]">
                          {activeOther5h?.resetTime
                            ? `${formatShortCountdown(activeOther5h.resetTime)} ${zh ? '重置' : 'reset'}`
                            : '—'}
                        </div>
                      </div>

                      <div className="group/meter min-w-0">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-[var(--ink-secondary)]">
                            {zh ? '周额度' : 'Weekly'}
                          </span>
                          <BlurNumber
                            mode="odometer"
                            value={quotaDisplay(activeOtherWeek?.remaining ?? null)}
                            className="font-mono font-semibold text-[var(--ink)]"
                          />
                        </div>
                        <div className="mt-1.5">
                          <MeterBar value={activeOtherWeek?.remaining ?? null} />
                        </div>
                        <div className="mt-1 truncate text-[10px] font-mono text-[var(--ink-muted)]">
                          {activeOtherWeek?.resetTime
                            ? `${formatShortCountdown(activeOtherWeek.resetTime)} ${zh ? '重置' : 'reset'}`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {((activeArgon?.remaining !== null && activeArgon?.remaining !== undefined) ||
                  (activeCarbonWeek?.remaining !== null && activeCarbonWeek?.remaining !== undefined)) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {activeArgon?.remaining !== null && activeArgon?.remaining !== undefined && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-mono tabular-nums text-[var(--ink-secondary)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" />
                        <span>Argon · {zh ? '周额度' : 'Weekly'}</span>
                        <strong className="font-semibold text-[var(--ink)]">
                          {quotaDisplay(activeArgon.remaining)}
                        </strong>
                        {activeArgon.resetTime && (
                          <span className="text-[10px] text-[var(--ink-muted)]">
                            · {formatShortCountdown(activeArgon.resetTime)}
                          </span>
                        )}
                      </span>
                    )}
                    {activeCarbonWeek?.remaining !== null && activeCarbonWeek?.remaining !== undefined && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-mono tabular-nums text-[var(--ink-secondary)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                        <span>Carbon · {zh ? '周额度' : 'Weekly'}</span>
                        <strong className="font-semibold text-[var(--ink)]">
                          {quotaDisplay(activeCarbonWeek.remaining)}
                        </strong>
                        {activeCarbonWeek.resetTime && (
                          <span className="text-[10px] text-[var(--ink-muted)]">
                            · {formatShortCountdown(activeCarbonWeek.resetTime)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
              </WaveRevealContainer>
            </div>
          ) : (
            <div key={clientTab} className="mk-capsule-switch mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[var(--surface-soft)] p-4 text-xs text-[var(--ink-muted)]">
              <span>
                {activeIdentity.email
                  ? (zh ? `检测到 ${activeIdentity.email}，尚未导入账号列表` : `${activeIdentity.email} detected; not yet imported`)
                  : activeIdentity.unmatchedSignIn
                    ? (zh ? '已读到本机登录，尚未匹配账号库。' : 'The local sign-in has no confirmed match in Accounts.')
                    : (zh ? '暂时无法确认此客户端的账号' : 'Unable to confirm this client’s account')}
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                {clientTab === 'classic' && isWindowsPlatform && (
                  clientProxyEnabled ? (
                    <button
                      type="button"
                      disabled={launchingClient}
                      onClick={() => void handleLaunchClientProxy()}
                      title={
                        zh
                          ? `以免 TUN 模式启动 Antigravity（${clientProxyUrl}）`
                          : `Launch Antigravity without TUN (${clientProxyUrl})`
                      }
                      className="tactile-press inline-flex items-center gap-1.5 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-3 py-1.5 font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)] disabled:opacity-50"
                    >
                      <RocketLaunch size={13} weight="bold" />
                      <span>{launchingClient ? (zh ? '启动中…' : 'Launching…') : (zh ? '免 TUN 启动' : 'No-TUN Launch')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('/settings?section=client_network')}
                      className="tactile-press inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-card)] px-3 py-1.5 font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    >
                      <RocketLaunch size={13} weight="bold" />
                      <span>{zh ? '配置免 TUN' : 'No-TUN Setup'}</span>
                    </button>
                  )
                )}
                {canSyncAppSignIn && (
                  <button type="button" onClick={() => void handleSyncAppSignIn()} disabled={appSignInBusy}
                    className="tactile-press rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-3 py-1.5 font-semibold text-[var(--primary-ink)] disabled:opacity-50">
                    {appSignInBusy ? (zh ? '正在同步…' : 'Syncing…') : (zh ? '同步 App 登录' : 'Sync App Sign-in')}
                  </button>
                )}
                <button type="button" onClick={() => navigate('/accounts')} className="font-semibold text-[var(--ink)] hover:underline">
                  {zh ? '前往账号列表 →' : 'Go to Accounts →'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Card 2: Smart Switch & Expire-Soon Recommendation */}
        <section
          style={{ '--stagger-index': 1 } as React.CSSProperties}
          className="mk-stagger lg:col-span-5 elevated-card elevated-card-hover flex h-full flex-col justify-between rounded-[28px] p-6"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkle size={16} weight="fill" className="text-[var(--primary-ink)]" />
                <h2 className="text-sm font-semibold text-[var(--ink)]">
                  {zh ? '切号推荐' : 'Recommended'}
                </h2>
              </div>
              {recommendation?.reason === 'expiring' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--amber-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--amber-ink)]">
                  <ClockCountdown size={12} weight="bold" />
                  <span>
                    {zh
                      ? `临期优先 · ${formatShortCountdown(recommendation.hoursLeft)}`
                      : `Expiring · ${formatShortCountdown(recommendation.hoursLeft)}`}
                  </span>
                </span>
              )}
            </div>

            {recommendation ? (
              <div className="mt-4 space-y-3">
                <div key={recommendation.account.id} className="mk-capsule-switch space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--ink)]">
                        {recommendation.account.email}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        {recommendation.reason === 'expiring'
                          ? zh
                            ? '周额度 24h 内重置，建议优先使用'
                            : 'Weekly quota resets within 24h — prioritize before expiry'
                          : recommendation.reason === 'best_paid'
                            ? zh
                              ? '付费账号 · 5H 余量最充裕'
                              : 'Paid tier priority · highest 5H headroom'
                            : zh
                              ? '当前余量最高'
                              : 'Highest available headroom'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-[20px] bg-[var(--surface-soft)] px-4 py-3">
                      <div className="text-[11px] text-[var(--ink-muted)]">Gemini 5H</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)] tabular-nums">
                        {recommendation.gemini5h ?? '—'}%
                      </div>
                    </div>
                    <div className="rounded-[20px] bg-[var(--surface-soft)] px-4 py-3">
                      <div className="text-[11px] text-[var(--ink-muted)]">Claude / GPT 5H</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)] tabular-nums">
                        {recommendation.other5h ?? '—'}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <MorphActionButton
                    variant="primary"
                    icon={<ArrowsLeftRight size={14} weight="bold" />}
                    idleLabel={
                      clientTab === 'classic'
                        ? zh ? '切换到此账号' : 'Use This Account'
                        : clientTab === 'ide'
                          ? zh ? '切换到此账号 · IDE' : 'Use in IDE'
                          : zh ? '切换到此账号 · CLI' : 'Use in CLI'
                    }
                    loadingLabel={zh ? '切换中…' : 'Switching…'}
                    successLabel={zh ? '已切换' : 'Switched'}
                    onClick={() => handleSwitchTarget(recommendation.account.id)}
                  />
                  {expiringList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllExpiring((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    >
                      <span>{zh ? `临期队列 (${expiringList.length})` : `Expiring (${expiringList.length})`}</span>
                      <CaretDown
                        size={12}
                        weight="bold"
                        className={`transition-transform duration-200 ease-out ${showAllExpiring ? 'rotate-180' : ''}`}
                      />
                    </button>
                  )}
                </div>

                <SpringAccordion open={showAllExpiring}>
                  <div className="mt-2.5 space-y-1.5 pt-1">
                    {expiringList.slice(0, 4).map((item) => (
                      <div
                        key={`${item.account.id}_${item.family}`}
                        className="flex items-center justify-between gap-2 rounded-[18px] bg-[var(--surface-soft)] px-3.5 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[var(--ink)]">
                            {item.account.email}
                          </div>
                          <div className="font-mono text-[10px] text-[var(--ink-muted)]">
                            {item.family === 'gemini' ? 'Gemini' : 'Claude/GPT'} · {item.weeklyRemaining}% ·{' '}
                            {formatShortCountdown(item.hoursLeft)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSwitchTarget(item.account.id)}
                          className="tactile-press shrink-0 rounded-full bg-[var(--bg-card)] px-3 py-1 text-[11px] font-semibold text-[var(--ink)] shadow-2xs hover:bg-[var(--surface-hover)]"
                        >
                          {zh ? '切换' : 'Switch'}
                        </button>
                      </div>
                    ))}
                  </div>
                </SpringAccordion>
              </div>
            ) : (
              <div className="mt-6 flex items-center gap-2 rounded-[20px] bg-[var(--surface-soft)] p-4 text-xs text-[var(--ink-muted)]">
                <WarningCircle size={16} />
                <span>{zh ? '暂无更优可用备用账号' : 'No better backup account available'}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Row 2: Aggregate Pool Health + Tri-Linked Local Usage */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Card 3: Pool Headroom */}
        <section
          style={{ '--stagger-index': 2 } as React.CSSProperties}
          className="mk-stagger lg:col-span-5 elevated-card elevated-card-hover h-full rounded-[28px] p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">
                {zh ? '号池平均余量' : 'Aggregate Pool Headroom'}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                {zh ? `共 ${poolStats.totalAccounts} 个账号` : `${poolStats.totalAccounts} accounts · equal-weight mean`}
              </p>
            </div>
            <SpringSegmentedControl
              size="sm"
              value={poolWindow}
              onChange={setPoolWindow}
              options={[
                { value: '5h', label: '5H' },
                { value: 'weekly', label: zh ? '每周' : 'Weekly' },
              ]}
            />
          </div>

          <div key={poolWindow} className="mk-capsule-switch mt-4 space-y-1.5">
            <div className="group group/meter rounded-[16px] px-3 py-2.5 transition-colors hover:bg-[var(--surface-soft)]">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="dotted-label font-medium text-[var(--ink)]">Gemini Shared</span>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span className="text-[11px] text-[var(--ink-muted)]">
                    {zh ? '可用' : 'Usable'} {poolStats.gemini.usable}/{poolStats.gemini.total}
                  </span>
                  <BlurNumber
                    mode="odometer"
                    value={quotaDisplay(poolStats.gemini.remaining)}
                    className="font-semibold text-[var(--ink)]"
                  />
                </div>
              </div>
              <MeterBar value={poolStats.gemini.remaining} />
            </div>

            <div className="group group/meter rounded-[16px] px-3 py-2.5 transition-colors hover:bg-[var(--surface-soft)]">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="dotted-label font-medium text-[var(--ink)]">Claude / GPT</span>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span className="text-[11px] text-[var(--ink-muted)]">
                    {zh ? '可用' : 'Usable'} {poolStats.other.usable}/{poolStats.other.total}
                  </span>
                  <BlurNumber
                    mode="odometer"
                    value={quotaDisplay(poolStats.other.remaining)}
                    className="font-semibold text-[var(--ink)]"
                  />
                </div>
              </div>
              <MeterBar value={poolStats.other.remaining} />
            </div>

            {poolStats.argon.total > 0 && (
              <div className="group group/meter rounded-[16px] px-3 py-2.5 transition-colors hover:bg-[var(--surface-soft)]">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink)]">
                    <span className="h-2 w-2 rounded-full bg-[var(--emerald)]" />
                    <span className="dotted-label">Gemini 4 Argon · {zh ? '周池' : 'Weekly'}</span>
                  </span>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      {poolStats.argon.covered}/{poolStats.argon.total}
                    </span>
                    <BlurNumber
                      mode="odometer"
                      value={quotaDisplay(poolStats.argon.remaining)}
                      className="font-semibold text-[var(--ink)]"
                    />
                  </div>
                </div>
                <MeterBar value={poolStats.argon.remaining} />
              </div>
            )}

            {poolStats.carbon.total > 0 && (
              <div className="group group/meter rounded-[16px] px-3 py-2.5 transition-colors hover:bg-[var(--surface-soft)]">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink)]">
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                    <span className="dotted-label">Gemini 4 Carbon · {zh ? '周池' : 'Weekly'}</span>
                  </span>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      {poolStats.carbon.covered}/{poolStats.carbon.total}
                    </span>
                    <BlurNumber
                      mode="odometer"
                      value={quotaDisplay(poolStats.carbon.remaining)}
                      className="font-semibold text-[var(--ink)]"
                    />
                  </div>
                </div>
                <MeterBar value={poolStats.carbon.remaining} />
              </div>
            )}

            {accounts.length > 0 && (
              <div className="mt-3 border-t border-[var(--border-hairline)] pt-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold text-[var(--ink-secondary)]">
                    {poolWindow === 'weekly'
                      ? zh ? '各账号周额度' : 'Per-Account Weekly'
                      : zh ? '各账号 5H 余量' : 'Per-Account 5H'}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate('/accounts')}
                    className="text-[11px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  >
                    {zh ? '全部 →' : 'All →'}
                  </button>
                </div>
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
                  {accounts.map((acc) => {
                    const g = extractPoolWindow(acc, 'gemini', poolWindow);
                    const o = extractPoolWindow(acc, 'other', poolWindow);
                    const ar = poolWindow === 'weekly' ? extractPoolWindow(acc, 'argon', 'weekly') : null;
                    const isActiveAcc = activeAccount?.id === acc.id;
                    return (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between gap-2 rounded-[14px] bg-[var(--surface-soft)] px-3 py-2 text-[11px]"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              isActiveAcc ? 'bg-[var(--emerald)]' : 'bg-[var(--border-strong)]'
                            }`}
                          />
                          <span className="truncate font-medium text-[var(--ink)]" title={acc.email}>
                            {acc.custom_label || acc.email}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] tabular-nums">
                          <span
                            title={g.resetTime ? `Gemini · ${formatShortCountdown(g.resetTime)}` : 'Gemini'}
                            className="text-[var(--ink-secondary)]"
                          >
                            G <strong className="text-[var(--ink)]">{quotaDisplay(g.remaining)}</strong>
                          </span>
                          <span
                            title={o.resetTime ? `Claude / GPT · ${formatShortCountdown(o.resetTime)}` : 'Claude / GPT'}
                            className="text-[var(--ink-secondary)]"
                          >
                            C <strong className="text-[var(--ink)]">{quotaDisplay(o.remaining)}</strong>
                          </span>
                          {ar && ar.remaining !== null && (
                            <span
                              title={ar.resetTime ? `Argon · ${formatShortCountdown(ar.resetTime)}` : 'Argon'}
                              className="rounded-full bg-[var(--emerald-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--emerald-ink)]"
                            >
                              A {Math.round(ar.remaining)}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Card 4: Tri-Linked Local Usage & Performance */}
        <section
          style={{ '--stagger-index': 3 } as React.CSSProperties}
          className="mk-stagger lg:col-span-7 elevated-card elevated-card-hover flex h-full flex-col justify-between rounded-[28px] p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">
                {zh ? '本地 Token 用量' : 'Local Token Usage & Speed'}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                {zh ? '直接读取本地客户端记录' : 'Read directly from local client records'}
              </p>
            </div>
            <SpringSegmentedControl
              size="sm"
              value={usageRange}
              onChange={setUsageRange}
              options={[
                { value: 'today', label: zh ? '今天' : 'Today' },
                { value: '3d', label: zh ? '3 天' : '3d' },
                { value: '7d', label: zh ? '7 天' : '7d' },
                { value: '30d', label: zh ? '30 天' : '30d' },
              ]}
            />
          </div>

          <div key={usageRange} className="mk-capsule-switch">
          <div className="my-5">
            <TriLinkedRingChart
              size={156}
              centerValue={compactTokens(usageMetrics.totals.total_tokens)}
              centerLabel={`${usageMetrics.totals.request_count} ${zh ? '次请求' : 'reqs'}`}
              segments={[
                {
                  id: 'input',
                  label: zh ? '输入 Token' : 'Input',
                  shortLabel: zh ? '输入' : 'Input',
                  subLabel: zh ? 'Prompt 与上下文' : 'Prompt & Context',
                  value: usageMetrics.totals.input_tokens,
                  displayValue: compactTokens(usageMetrics.totals.input_tokens),
                  color: '#2554c7',
                },
                {
                  id: 'output',
                  label: zh ? '输出 Token' : 'Output',
                  shortLabel: zh ? '输出' : 'Output',
                  subLabel: zh ? '模型生成内容' : 'Model Completion',
                  value: usageMetrics.totals.output_tokens,
                  displayValue: compactTokens(usageMetrics.totals.output_tokens),
                  color: '#5b89f7',
                },
                {
                  id: 'cached',
                  label: zh ? '缓存命中' : 'Cached',
                  shortLabel: zh ? '缓存' : 'Cached',
                  subLabel: zh ? '前缀缓存命中' : 'Prefix Cache Hit',
                  value: usageMetrics.totals.cached_tokens,
                  displayValue: compactTokens(usageMetrics.totals.cached_tokens),
                  color: '#0daf84',
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="rounded-[20px] bg-[var(--surface-soft)] px-4 py-3">
              <div className="text-[11px] text-[var(--ink-muted)]">
                {zh ? 'API 折算' : 'API Equivalent'}
              </div>
              <BlurNumber
                mode="odometer"
                value={usageMetrics.formattedCost}
                className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)]"
              />
            </div>
            <div className="rounded-[20px] bg-[var(--surface-soft)] px-4 py-3">
              <div className="text-[11px] text-[var(--ink-muted)]">
                {zh ? '首字延迟' : 'First-Text Latency'}
              </div>
              <BlurNumber
                mode="odometer"
                value={
                  usageMetrics.perf
                    ? `${usageMetrics.perf.first_text_seconds.toFixed(2)} s`
                    : '—'
                }
                className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)]"
              />
            </div>
            <div className="rounded-[20px] bg-[var(--surface-soft)] px-4 py-3">
              <div className="text-[11px] text-[var(--ink-muted)]">
                {zh ? '输出速度' : 'Output Speed'}
              </div>
              <BlurNumber
                mode="odometer"
                value={
                  usageMetrics.perf
                    ? `${usageMetrics.perf.body_tokens_per_second.toFixed(1)} tok/s`
                    : '—'
                }
                className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)]"
              />
            </div>
          </div>
          </div>
        </section>
      </div>
    </div>
  );
}
