import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppWindow,
  ArrowsClockwise,
  ArrowsLeftRight,
  Check,
  CheckCircle,
  ClockCountdown,
  GearSix,
  PushPin,
  PushPinSlash,
  Users,
  X,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useConfigStore } from '../stores/useConfigStore';
import * as accountService from '../services/accountService';
import { SpringSegmentedControl } from '../components/motion/SpringSegmentedControl';
import { TriLinkedRingChart } from '../components/motion/TriLinkedRingChart';
import { BlurNumber } from '../components/motion/BlurNumber';
import { SpringMeter } from '../components/motion/SpringMeter';
import { SpringToastContainer, showToast } from '../components/motion/SpringToast';
import {
  aggregateArgon,
  aggregateCarbon,
  aggregateMenuBar,
  menuBarAccount,
  quotaDisplay,
  quotaTone,
  type MenuBarSnapshot,
  type QuotaWindow,
} from '../utils/menuBarOverview';
import { formatShortCountdown } from '../utils/accountInsights';
import { getAccountTier } from '../utils/accountTier';
import { AccountTierBadge } from '../components/accounts/AccountTierBadge';
import { DEFAULT_MENU_BAR_PREFERENCES, menuBarResetTimeDisplay } from '../types/config';
import { isTauri } from '../utils/env';
import { request } from '../utils/request';

interface MenuBarUsage {
  today: {
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    total_tokens: number;
    request_count: number;
  };
  estimated_usd?: number | null;
  performance?: {
    sample_count: number;
    first_text_seconds: number;
    body_tokens_per_second: number;
  } | null;
}

const compactTokens = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
};

export default function MenuBarDashboard() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const navigate = useNavigate();

  const config = useConfigStore((s) => s.config);
  const loadConfig = useConfigStore((s) => s.loadConfig);

  const [snapshot, setSnapshot] = useState<MenuBarSnapshot | null>(null);
  const [usage, setUsage] = useState<MenuBarUsage | null>(null);
  const [pinned, setPinned] = useState(false);
  const [windowMode, setWindowMode] = useState<QuotaWindow>('5h');
  const [refreshing, setRefreshing] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const generationRef = useRef(0);
  const operationRef = useRef(false);

  const prefs = config?.menu_bar ?? DEFAULT_MENU_BAR_PREFERENCES;
  const resetDisplay = menuBarResetTimeDisplay(prefs);

  const loadData = useCallback(async () => {
    const gen = ++generationRef.current;
    const [snap, usg, pinState] = await Promise.all([
      request<MenuBarSnapshot>('get_menu_bar_snapshot').catch(() => null),
      request<MenuBarUsage>('get_menu_bar_usage').catch(() => null),
      request<boolean>('is_menu_bar_pinned').catch(() => false),
    ]);
    if (gen !== generationRef.current) return;
    if (snap) setSnapshot(snap);
    if (usg) setUsage(usg);
    setPinned(Boolean(pinState));
  }, []);

  useEffect(() => {
    if (!config) void loadConfig();
    void loadData();
  }, [config, loadConfig, loadData]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (disposed) return;
      unlisteners.push(
        await listen('menubar://opened', () => {
          void loadConfig();
          void loadData();
        }),
        await listen('menubar://data-updated', () => void loadData()),
        await listen('menubar://preferences-updated', () => {
          void loadConfig();
          void loadData();
        }),
        await listen<string>('menubar://error', (event) => {
          if (event.payload) showToast(String(event.payload), 'error');
        }),
        await listen('accounts://refreshed', () => void loadData()),
        await listen('tray://account-switched', () => void loadData())
      );
    })();
    return () => {
      disposed = true;
      unlisteners.forEach((u) => u());
    };
  }, [loadConfig, loadData]);

  // ESC hides tray popover in Tauri
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isTauri()) void request('hide_menu_bar_dashboard').catch(() => {});
        else navigate('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const now = Date.now();
  const staleMinutes = config?.refresh_interval || 15;

  const accountViews = useMemo(() => {
    const list = snapshot?.accounts || [];
    return list.map((acc) => menuBarAccount(acc, now, staleMinutes));
  }, [snapshot?.accounts, now, staleMinutes]);

  const visibleAccounts = useMemo(() => {
    const hideUnavail = prefs.hide_unavailable ?? true;
    return hideUnavail ? accountViews.filter((v) => v.switchable) : accountViews;
  }, [accountViews, prefs.hide_unavailable]);

  const aggGemini = useMemo(
    () => aggregateMenuBar(accountViews, 'gemini', windowMode, config?.quota_protection?.threshold_percentage ?? 10),
    [accountViews, windowMode, config?.quota_protection?.threshold_percentage]
  );
  const aggOther = useMemo(
    () => aggregateMenuBar(accountViews, 'other', windowMode, config?.quota_protection?.threshold_percentage ?? 10),
    [accountViews, windowMode, config?.quota_protection?.threshold_percentage]
  );
  const aggArgon = useMemo(() => aggregateArgon(accountViews), [accountViews]);
  const aggCarbon = useMemo(() => aggregateCarbon(accountViews), [accountViews]);

  const togglePin = async () => {
    const next = !pinned;
    setPinned(next);
    try {
      await request('set_menu_bar_pinned', { pinned: next });
      showToast(
        next ? (zh ? '已置顶托盘浮窗' : 'Popover pinned on top') : (zh ? '已取消置顶' : 'Popover unpinned'),
        'info'
      );
    } catch (e) {
      setPinned(!next);
      showToast(String(e), 'error');
    }
  };

  const handleRefresh = async () => {
    if (operationRef.current) return;
    operationRef.current = true;
    setRefreshing(true);
    try {
      await accountService.refreshAllQuotas();
      await loadData();
      showToast(zh ? '配额已更新' : 'Quotas refreshed', 'success');
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      operationRef.current = false;
      setRefreshing(false);
    }
  };

  const handleSwitch = async (id: string, email: string) => {
    if (operationRef.current) return;
    operationRef.current = true;
    setSwitchingId(id);
    try {
      await accountService.switchAccount(id, 'app');
      await loadData();
      showToast(zh ? `已切换到 ${email}` : `Switched to ${email}`, 'success');
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      operationRef.current = false;
      setSwitchingId(null);
    }
  };

  const openPage = async (page: 'dashboard' | 'accounts' | 'settings') => {
    if (isTauri()) {
      await request('open_app_page', { page }).catch(() => {});
      if (!pinned) {
        await request('hide_menu_bar_dashboard').catch(() => {});
      }
      return;
    }
    navigate(page === 'dashboard' ? '/' : `/${page}`);
  };

  const ringSegments = useMemo(() => {
    const t = usage?.today;
    return [
      {
        id: 'input',
        label: zh ? '输入' : 'Input',
        value: t?.input_tokens ?? 0,
        displayValue: compactTokens(t?.input_tokens ?? 0),
        color: '#2554c7',
      },
      {
        id: 'output',
        label: zh ? '输出' : 'Output',
        value: t?.output_tokens ?? 0,
        displayValue: compactTokens(t?.output_tokens ?? 0),
        color: '#5b89f7',
      },
      {
        id: 'cache',
        label: zh ? '缓存' : 'Cached',
        value: t?.cached_tokens ?? 0,
        displayValue: compactTokens(t?.cached_tokens ?? 0),
        color: '#0daf84',
      },
    ];
  }, [usage?.today, zh]);

  const formatAccountTitle = (acc: MenuBarSnapshot['accounts'][number]) => {
    const style = prefs.label_style ?? 'email_then_label';
    if (style === 'email_only' || !acc.custom_label) {
      return { primary: acc.email, secondary: acc.custom_label || null };
    }
    if (style === 'label_then_email') {
      return { primary: acc.custom_label, secondary: acc.email };
    }
    return { primary: acc.email, secondary: acc.custom_label };
  };

  const toneTextCls = (val: number | null) => {
    const tone = quotaTone(val, prefs);
    if (tone === 'healthy') return 'text-[var(--emerald-ink)]';
    if (tone === 'warning') return 'text-[var(--amber-ink)]';
    if (tone === 'critical') return 'text-[var(--rose-ink)]';
    return 'text-[var(--ink-muted)]';
  };

  const toneBarCls = (val: number | null) => {
    const tone = quotaTone(val, prefs);
    if (tone === 'healthy') return 'bg-[var(--emerald)]';
    if (tone === 'warning') return 'bg-[var(--amber)]';
    if (tone === 'critical') return 'bg-[var(--rose)]';
    return 'bg-[var(--border-strong)]';
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-[var(--bg-page)] sm:p-5">
      <div className="flex h-[688px] w-full max-w-[432px] flex-col overflow-hidden bg-[var(--bg-page)] sm:rounded-[32px] sm:border sm:border-[var(--border-hairline)] sm:shadow-[var(--shadow-popover)]">
        {/* Compact Pill Header */}
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] px-3.5 shadow-[var(--shadow-shell)]">
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="status-ping-ring absolute inset-0 rounded-full bg-[var(--emerald)]" />
              <span className="relative h-2 w-2 rounded-full bg-[var(--emerald)]" />
            </span>
            <span className="text-xs font-semibold tracking-tight text-[var(--ink)]">
              AgyFlux
            </span>
            <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--ink-secondary)]">
              {visibleAccounts.length}
            </span>
          </div>

          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-shell)]">
            <button
              type="button"
              onClick={() => void togglePin()}
              title={pinned ? (zh ? '取消置顶' : 'Unpin') : (zh ? '置顶浮窗' : 'Pin on top')}
              className={`tactile-press flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                pinned
                  ? 'bg-[var(--primary-soft)] text-[var(--primary-ink)]'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
              }`}
            >
              {pinned ? <PushPin size={13} weight="fill" /> : <PushPinSlash size={13} weight="bold" />}
            </button>

            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              title={zh ? '刷新全部配额' : 'Refresh all'}
              className="tactile-press flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              <ArrowsClockwise size={13} weight="bold" className={refreshing ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={() => void openPage('dashboard')}
              title={zh ? '打开主窗口' : 'Open main window'}
              className="tactile-press flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            >
              <AppWindow size={13} weight="bold" />
            </button>

            {!isTauri() && (
              <button
                type="button"
                onClick={() => navigate('/')}
                title={zh ? '返回主界面' : 'Back to overview'}
                className="tactile-press flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-2">
          {/* Today Telemetry & Ring */}
          <div className="elevated-card rounded-[24px] p-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--ink)]">{zh ? '今日用量' : "Today's Usage"}</span>
              <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
                {usage?.performance && (
                  <>
                    <span>{usage.performance.first_text_seconds.toFixed(2)}s</span>
                    <span>·</span>
                    <span>{Math.round(usage.performance.body_tokens_per_second)} t/s</span>
                  </>
                )}
              </div>
            </div>

            <TriLinkedRingChart
              compact
              size={92}
              segments={ringSegments}
              centerValue={compactTokens(usage?.today?.total_tokens ?? 0)}
              centerLabel={
                usage?.estimated_usd != null
                  ? `≈ $${usage.estimated_usd.toFixed(2)}`
                  : 'Tokens'
              }
            />
          </div>

          {/* Pool Health Summary */}
          <div className="elevated-card rounded-[24px] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--ink)]">
                {zh ? '号池平均余量' : 'Pool Headroom'}
              </span>
              <SpringSegmentedControl
                size="sm"
                value={windowMode}
                onChange={setWindowMode}
                options={[
                  { value: '5h', label: '5H' },
                  { value: 'weekly', label: zh ? '每周' : 'Weekly' },
                ]}
              />
            </div>

            <div key={windowMode} className="mk-capsule-switch">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[18px] bg-[var(--surface-soft)] px-3.5 py-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[var(--ink-secondary)]">Gemini</span>
                    <BlurNumber value={quotaDisplay(aggGemini.remaining)} className={`font-semibold tabular-nums ${toneTextCls(aggGemini.remaining)}`} />
                  </div>
                  <SpringMeter value={aggGemini.remaining} fillClassName={toneBarCls(aggGemini.remaining)} index={0} className="mt-1.5 h-1 bg-[var(--bg-card)]" />
                </div>

                <div className="rounded-[18px] bg-[var(--surface-soft)] px-3.5 py-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[var(--ink-secondary)]">Claude/GPT</span>
                    <BlurNumber value={quotaDisplay(aggOther.remaining)} className={`font-semibold tabular-nums ${toneTextCls(aggOther.remaining)}`} />
                  </div>
                  <SpringMeter value={aggOther.remaining} fillClassName={toneBarCls(aggOther.remaining)} index={1} className="mt-1.5 h-1 bg-[var(--bg-card)]" />
                </div>
              </div>

              {(aggArgon.total > 0 || aggCarbon.total > 0) && (
                <div className="mt-2.5 flex flex-wrap gap-2 text-[10px] tabular-nums text-[var(--ink-secondary)]">
                  {aggArgon.total > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--emerald-soft)] px-2.5 py-0.5 font-medium text-[var(--emerald-ink)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" />
                      Argon {quotaDisplay(aggArgon.remaining)}
                    </span>
                  )}
                  {aggCarbon.total > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface)] px-2.5 py-0.5 font-medium">
                      Carbon {quotaDisplay(aggCarbon.remaining)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Account List */}
          <div key={`list-${windowMode}`} className="mk-capsule-switch space-y-2.5">
            {visibleAccounts.map((view) => {
              const acc = view.account;
              const isCurrent = snapshot?.current_account_id === acc.id;
              const title = formatAccountTitle(acc);
              const gemVal = view.windows[windowMode].gemini.remaining;
              const othVal = view.windows[windowMode].other.remaining;
              const altWindow: QuotaWindow = windowMode === '5h' ? 'weekly' : '5h';
              const showAltWindow = (prefs.show_session ?? true) && (prefs.show_weekly ?? true);
              const altGemVal = view.windows[altWindow].gemini.remaining;
              const altOthVal = view.windows[altWindow].other.remaining;
              const resetIso =
                view.windows[windowMode].gemini.resets[0] ||
                view.windows[windowMode].other.resets[0];
              const tier = getAccountTier({
                quota: acc.quota
                  ? { last_updated: acc.quota.last_updated || 0, models: [], subscription_tier: acc.quota.subscription_tier ?? undefined }
                  : undefined,
              });
              const argonPct = view.argonWeekly.remaining;
              const carbonPct = view.carbonWeekly.remaining;
              const hoursLeft = resetIso ? (Date.parse(resetIso) - now) / 3600_000 : null;
              const isExpiring = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 24 && (gemVal ?? 0) > 5;

              return (
                <div
                  key={acc.id}
                  className={`group elevated-card rounded-[24px] px-4 py-3.5 ${
                    isCurrent
                      ? 'border-[var(--border-strong)]'
                      : 'hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {argonPct !== null && argonPct > 0 && (
                          <span
                            title={`Argon ${Math.round(argonPct)}%`}
                            className="h-2 w-2 shrink-0 rounded-full bg-[var(--emerald)]"
                          />
                        )}
                        <span className="truncate text-xs font-semibold text-[var(--ink)]">{title.primary}</span>
                        {isCurrent && (
                          <CheckCircle size={14} weight="fill" className="shrink-0 text-[var(--emerald)]" />
                        )}
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--ink-muted)]">
                        <AccountTierBadge tier={tier} subscription={acc.quota?.subscription_tier} variant="text" />
                        {title.secondary && <span className="truncate">· {title.secondary}</span>}
                        {isExpiring && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--amber-soft)] px-1.5 py-0.2 text-[9px] font-semibold text-[var(--amber-ink)]">
                            <ClockCountdown size={9} weight="bold" />
                            {zh ? '临期' : 'Exp'}
                          </span>
                        )}
                        {resetIso && resetDisplay !== 'hidden' && (
                          <span
                            className={`tabular-nums ${
                              resetDisplay === 'hover' ? 'opacity-0 transition-opacity group-hover:opacity-100' : ''
                            }`}
                          >
                            · ↻ {formatShortCountdown(resetIso)}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSwitch(acc.id, acc.email)}
                      disabled={switchingId === acc.id}
                      className={`tactile-press inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[11px] font-semibold ${
                        isCurrent
                          ? 'bg-[var(--surface-soft)] text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
                          : 'border border-[var(--primary-border)] bg-[var(--primary-soft)] text-[var(--primary-ink)] shadow-[0_1px_2px_rgba(25,25,20,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] hover:bg-[var(--primary-soft-hover)]'
                      }`}
                    >
                      {isCurrent ? (
                        <Check size={11} weight="bold" />
                      ) : (
                        <ArrowsLeftRight size={11} weight="bold" />
                      )}
                      <span>{switchingId === acc.id ? '...' : isCurrent ? (zh ? '使用中' : 'In Use') : (zh ? '切换' : 'Switch')}</span>
                    </button>
                  </div>

                  {/* Compact Twin Meters */}
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-[var(--ink-muted)]">G</span>
                      <SpringMeter value={gemVal} fillClassName={toneBarCls(gemVal)} index={2} className="h-1 flex-1 bg-[var(--surface)]" />
                      <span className={`w-8 text-right text-[10px] font-semibold tabular-nums ${toneTextCls(gemVal)}`}>
                        {quotaDisplay(gemVal)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-[var(--ink-muted)]">C</span>
                      <SpringMeter value={othVal} fillClassName={toneBarCls(othVal)} index={3} className="h-1 flex-1 bg-[var(--surface)]" />
                      <span className={`w-8 text-right text-[10px] font-semibold tabular-nums ${toneTextCls(othVal)}`}>
                        {quotaDisplay(othVal)}
                      </span>
                    </div>
                  </div>

                  {/* Complementary window + dedicated weekly pools */}
                  {((showAltWindow && (altGemVal !== null || altOthVal !== null)) ||
                    argonPct !== null ||
                    carbonPct !== null) && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-[var(--border-hairline)] pt-1.5 text-[10px] tabular-nums text-[var(--ink-muted)]">
                      {showAltWindow && (altGemVal !== null || altOthVal !== null) && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {altWindow === 'weekly' ? (zh ? '周额度' : 'Weekly') : '5H'}
                          </span>
                          <span>
                            G <strong className={toneTextCls(altGemVal)}>{quotaDisplay(altGemVal)}</strong>
                          </span>
                          <span>
                            C <strong className={toneTextCls(altOthVal)}>{quotaDisplay(altOthVal)}</strong>
                          </span>
                        </div>
                      )}
                      {(argonPct !== null || carbonPct !== null) && (
                        <div className="flex items-center gap-1.5">
                          {argonPct !== null && (
                            <span className="rounded-full bg-[var(--emerald-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--emerald-ink)]">
                              Argon {Math.round(argonPct)}%
                            </span>
                          )}
                          {carbonPct !== null && (
                            <span className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--ink-secondary)]">
                              Carbon {Math.round(carbonPct)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Floating Pill Footer */}
        <footer className="flex items-center justify-between gap-2 px-4 pt-1 pb-3.5 text-xs">
          <button
            type="button"
            onClick={() => void openPage('accounts')}
            className="tactile-press inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] font-medium text-[var(--ink-secondary)] shadow-[var(--shadow-shell)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          >
            <Users size={13} weight="bold" />
            <span>{zh ? '账号列表' : 'Accounts'}</span>
          </button>
          <button
            type="button"
            onClick={() => void openPage('settings')}
            className="tactile-press inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] font-medium text-[var(--ink-secondary)] shadow-[var(--shadow-shell)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          >
            <GearSix size={13} weight="bold" />
            <span>{zh ? '偏好设置' : 'Settings'}</span>
          </button>
        </footer>
      </div>
      <SpringToastContainer />
    </div>
  );
}
