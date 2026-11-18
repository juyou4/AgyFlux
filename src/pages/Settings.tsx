import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  CheckCircle,
  CloudArrowDown,
  Coins,
  Desktop,
  DotsSixVertical,
  FolderOpen,
  Globe,
  HardDrives,
  SlidersHorizontal,
  Translate,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAccountStore } from '../stores/useAccountStore';
import { useConfigStore } from '../stores/useConfigStore';
import { useUpdateStore } from '../stores/useUpdateStore';
import * as autoSwitchService from '../services/autoSwitchService';
import * as configService from '../services/configService';
import * as updaterService from '../services/updaterService';
import { SpringSegmentedControl } from '../components/motion/SpringSegmentedControl';
import { MorphActionButton } from '../components/motion/MorphActionButton';
import { SpringAccordion } from '../components/motion/SpringAccordion';
import { DropdownSelector } from '../components/motion/DropdownSelector';
import { SpringCheckbox } from '../components/motion/SpringCheckbox';
import { SpringNumberInput } from '../components/motion/SpringNumberInput';
import { showToast } from '../components/motion/SpringToast';
import { getAccountTier, type AccountTier } from '../utils/accountTier';
import { AccountTierBadge } from '../components/accounts/AccountTierBadge';
import { isTauri } from '../utils/env';
import type { AutoSwitchConfig, AutoSwitchStatus, AutoSwitchTarget, AutoSwitchStrategy } from '../types/autoSwitch';
import {
  DEFAULT_MENU_BAR_PREFERENCES,
  DEFAULT_QUOTA_VALUATION_CONFIG,
  type AppConfig,
  type MenuBarPreferences,
  type MenuBarQuotaScope,
  type MenuBarResetTimeDisplay,
} from '../types/config';

type SettingsSection = 'auto_switch' | 'client_network' | 'display_valuation' | 'desktop_data';

const COMMON_MODELS = [
  'gemini-3-pro-high',
  'gemini-3-flash',
  'claude-sonnet-4-6',
  'claude-opus-4-6-thinking',
  'gemini-4-argon-high',
  'gemini-4-carbon-high',
];

const PROTECTED_MODEL_KEYS = [
  { key: 'gemini-pro', label: 'Gemini Pro / Ultra' },
  { key: 'gemini-flash', label: 'Gemini Flash' },
  { key: 'claude', label: 'Claude / GPT' },
];

function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  // 复刻 12-通知设置面板总开关：轨道底色 250ms 渐变，滑钮走 --sp-snap 弹簧；按下时滑钮向行进方向伸展
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{ transition: 'background-color 240ms ease' }}
      className={`group relative inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-full p-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-45 ${
        checked ? 'bg-[var(--emerald)]' : 'bg-[var(--surface-hover)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(25,25,20,0.22)] group-active:w-[22px] ${
          checked ? 'translate-x-[18px] group-active:translate-x-[16px]' : 'translate-x-0'
        }`}
        style={{ transition: 'transform var(--t-snap) var(--sp-snap), width var(--t-soft) var(--sp-soft)' }}
      />
    </button>
  );
}

function SortableCandidateRow({
  id,
  email,
  label,
  tier,
  subscription,
  priority,
  included,
  onToggle,
}: {
  id: string;
  email: string;
  label?: string;
  tier: AccountTier;
  subscription?: string;
  priority: number;
  included: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center justify-between gap-2 rounded-full px-3.5 py-2.5 text-xs transition-colors ${
        isDragging
          ? 'bg-[var(--bg-card)] shadow-[var(--shadow-popover)] ring-1 ring-[var(--border-strong)]'
          : included
            ? 'bg-[var(--bg-card)] shadow-[0_1px_2px_rgba(25,25,20,0.04)]'
            : 'bg-transparent opacity-65 hover:bg-[var(--bg-card)]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab rounded-full p-0.5 text-[var(--ink-muted)] hover:text-[var(--ink)] active:cursor-grabbing"
        >
          <DotsSixVertical size={14} weight="bold" />
        </button>
        <SpringCheckbox
          checked={included}
          onChange={onToggle}
          ariaLabel={label || email}
        />
        <span className="truncate font-medium text-[var(--ink)]">{label || email}</span>
        {label && <span className="hidden truncate text-[11px] text-[var(--ink-muted)] sm:inline">{email}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 tabular-nums">
        <AccountTierBadge tier={tier} subscription={subscription} />
        <span className="text-[11px] text-[var(--ink-muted)]">P{priority}</span>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="elevated-card rounded-[28px] p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');

  const accounts = useAccountStore((s) => s.accounts);
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts);

  const { config, loadConfig, saveConfig, updateTheme, updateLanguage } = useConfigStore();
  const { updateInfo, isChecking, checkForUpdates } = useUpdateStore();

  const [activeSection, setActiveSection] = useState<SettingsSection>('auto_switch');
  const railRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [railIndicator, setRailIndicator] = useState<{ top: number; height: number }>({ top: 0, height: 36 });
  const [railReady, setRailReady] = useState(false);

  const [autoSwitchConfig, setAutoSwitchConfig] = useState<AutoSwitchConfig | null>(null);
  const [autoSwitchStatus, setAutoSwitchStatus] = useState<AutoSwitchStatus | null>(null);
  const [desktopStatus, setDesktopStatus] = useState<configService.DesktopStatus | null>(null);
  const [experiments, setExperiments] = useState<configService.AppExperimentsStatus | null>(null);
  const [dataDir, setDataDir] = useState<string>('~/.antigravity_tools');
  const [runningVersion, setRunningVersion] = useState<string>('1.0.0');

  const [proxyModeDraft, setProxyModeDraft] = useState<'system' | 'direct' | 'manual'>('system');
  const [proxyUrlDraft, setProxyUrlDraft] = useState('');
  const [proxyError, setProxyError] = useState<string | null>(null);
  const proxyInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const navItems: { id: SettingsSection; label: string; desc: string; icon: React.ReactNode }[] = useMemo(
    () => [
      {
        id: 'auto_switch',
        label: zh ? '自动切换' : 'Auto Switch',
        desc: zh ? '条件与队列' : 'Safety & rotation',
        icon: <ArrowsLeftRight size={16} weight="bold" />,
      },
      {
        id: 'client_network',
        label: zh ? '客户端与网络' : 'Clients & Network',
        desc: zh ? '路径与代理' : 'Paths, proxy & guard',
        icon: <Globe size={16} weight="bold" />,
      },
      {
        id: 'display_valuation',
        label: zh ? '显示与估值' : 'Display & Value',
        desc: zh ? '主题与托盘' : 'Theme, tray & value',
        icon: <Coins size={16} weight="bold" />,
      },
      {
        id: 'desktop_data',
        label: zh ? '桌面与数据' : 'Desktop & Data',
        desc: zh ? '自启与目录' : 'Boot, storage & updates',
        icon: <HardDrives size={16} weight="bold" />,
      },
    ],
    [zh]
  );

  // 侧栏滑块：绘制前用 offsetTop 测量（不受页面入场 transform 影响），首次定位不播放过渡，避免进入设置页时滑块从顶部飞入
  const railPlacedRef = useRef(false);
  useLayoutEffect(() => {
    const updatePos = () => {
      const btn = itemRefs.current[activeSection];
      if (!btn || btn.offsetParent === null) return;
      setRailIndicator({ top: btn.offsetTop, height: btn.offsetHeight });
      if (!railPlacedRef.current) {
        railPlacedRef.current = true;
        // 首帧落位后再开启过渡
        requestAnimationFrame(() => requestAnimationFrame(() => setRailReady(true)));
      }
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    return () => window.removeEventListener('resize', updatePos);
  }, [activeSection, navItems]);

  const bootstrap = useCallback(async () => {
    await Promise.all([
      !config ? loadConfig() : Promise.resolve(),
      !accounts.length ? fetchAccounts() : Promise.resolve(),
    ]);
    const [asCfg, asSt, ds, exp, dir, ver] = await Promise.all([
      autoSwitchService.getAutoSwitchConfig().catch(() => null),
      autoSwitchService.getAutoSwitchStatus().catch(() => null),
      configService.getDesktopSettings().catch(() => null),
      configService.getAppExperiments().catch(() => null),
      configService.getDataDirPath().catch(() => null),
      updaterService.getRunningVersion().catch(() => null),
    ]);
    if (asCfg) setAutoSwitchConfig(asCfg);
    if (asSt) setAutoSwitchStatus(asSt);
    if (ds) setDesktopStatus(ds);
    if (exp) setExperiments(exp);
    if (dir) setDataDir(dir);
    if (ver) setRunningVersion(ver);
  }, [config, loadConfig, accounts.length, fetchAccounts]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (config?.network?.proxy_mode) {
      setProxyModeDraft(config.network.proxy_mode);
    }
    if (config?.network?.proxy_url !== undefined) {
      setProxyUrlDraft(config.network.proxy_url);
    }
  }, [config?.network?.proxy_mode, config?.network?.proxy_url]);

  const persistConfig = async (next: AppConfig, toastText?: string) => {
    try {
      await saveConfig(next, true);
      if (toastText) showToast(toastText, 'success');
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  const persistAutoSwitch = async (next: AutoSwitchConfig, toastText?: string) => {
    setAutoSwitchConfig(next);
    try {
      const saved = await autoSwitchService.setAutoSwitchConfig(next);
      setAutoSwitchConfig(saved);
      const st = await autoSwitchService.getAutoSwitchStatus().catch(() => null);
      if (st) setAutoSwitchStatus(st);
      if (toastText) showToast(toastText, 'success');
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  // Candidate list ordering: configured ids first, then remaining accounts
  const orderedCandidateAccounts = useMemo(() => {
    const selected = autoSwitchConfig?.candidate_account_ids || [];
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const first = selected.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
    const seen = new Set(first.map((a) => a.id));
    const rest = accounts.filter((a) => !seen.has(a.id));
    return [...first, ...rest];
  }, [accounts, autoSwitchConfig?.candidate_account_ids]);

  const modelOptions = useMemo(() => {
    const set = new Set<string>(COMMON_MODELS);
    for (const acc of accounts) {
      for (const m of acc.quota?.models || []) {
        if (m.name) set.add(m.name);
      }
    }
    return [...set];
  }, [accounts]);

  const handleCandidateDragEnd = async (event: DragEndEvent) => {
    if (!autoSwitchConfig) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedCandidateAccounts.map((a) => a.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedAll = arrayMove(ids, oldIndex, newIndex);
    const selectedSet = new Set(autoSwitchConfig.candidate_account_ids);
    const nextCandidates = reorderedAll.filter((id) => selectedSet.has(id));
    await persistAutoSwitch({ ...autoSwitchConfig, candidate_account_ids: nextCandidates });
  };

  const toggleCandidateId = async (accountId: string) => {
    if (!autoSwitchConfig) return;
    const exists = autoSwitchConfig.candidate_account_ids.includes(accountId);
    const nextIds = exists
      ? autoSwitchConfig.candidate_account_ids.filter((id) => id !== accountId)
      : orderedCandidateAccounts
          .map((a) => a.id)
          .filter((id) => id === accountId || autoSwitchConfig.candidate_account_ids.includes(id));
    await persistAutoSwitch({ ...autoSwitchConfig, candidate_account_ids: nextIds });
  };

  const handleBrowseExecutable = async (field: 'antigravity_executable' | 'antigravity_ide_executable') => {
    if (!config) return;
    if (!isTauri()) {
      showToast(zh ? '浏览器预览模式请直接输入可执行文件路径' : 'Enter path manually in browser preview', 'info');
      return;
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false, directory: false });
      if (typeof selected === 'string' && selected.trim()) {
        await persistConfig(
          { ...config, [field]: selected.trim() },
          zh ? '客户端路径已更新' : 'Executable path updated'
        );
      }
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  const isValidProxyUrl = (raw: string) => /^(https?|socks5h?):\/\/.+/i.test(raw.trim());

  const handleProxyModeChange = async (mode: 'system' | 'direct' | 'manual') => {
    if (!config) return;
    setProxyModeDraft(mode);
    setProxyError(null);
    const trimmed = proxyUrlDraft.trim();
    if (mode === 'manual') {
      if (isValidProxyUrl(trimmed)) {
        await persistConfig(
          { ...config, network: { proxy_mode: 'manual', proxy_url: trimmed } },
          zh ? '网络代理设置已保存' : 'Network proxy saved'
        );
      } else {
        window.setTimeout(() => proxyInputRef.current?.focus(), 120);
      }
      return;
    }
    await persistConfig(
      { ...config, network: { proxy_mode: mode, proxy_url: trimmed } },
      zh ? '网络代理设置已保存' : 'Network proxy saved'
    );
  };

  const handleProxySave = async (mode: 'system' | 'direct' | 'manual', url = proxyUrlDraft) => {
    if (!config) return;
    const trimmed = url.trim();
    if (mode === 'manual') {
      if (!isValidProxyUrl(trimmed)) {
        setProxyError(zh ? '请输入有效的代理地址（如 http://127.0.0.1:7890 或 socks5://...）' : 'Enter a valid http:// or socks5:// URL');
        return;
      }
    }
    setProxyModeDraft(mode);
    setProxyError(null);
    await persistConfig(
      { ...config, network: { proxy_mode: mode, proxy_url: trimmed } },
      zh ? '网络代理设置已保存' : 'Network proxy saved'
    );
  };

  const handleDesktopPatch = async (patch: {
    launch_at_login?: boolean;
    hide_dock_icon?: boolean;
    start_minimized?: boolean;
  }) => {
    try {
      const updated = await configService.setDesktopPreferences(patch);
      setDesktopStatus(updated);
      showToast(zh ? '桌面设置已应用' : 'Desktop preferences updated', 'success');
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  const menuBar: MenuBarPreferences = config?.menu_bar ?? DEFAULT_MENU_BAR_PREFERENCES;
  const valuationCfg = config?.quota_valuation ?? DEFAULT_QUOTA_VALUATION_CONFIG;

  const updateMenuBar = async (patch: Partial<MenuBarPreferences>) => {
    try {
      const next = await configService.setMenuBarPreferences({
        quotaScope: patch.quota_scope,
        patch,
      });
      if (config) {
        useConfigStore.setState({ config: { ...config, menu_bar: next } });
      }
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  return (
    <div className="pb-12">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Left Navigation Rail (floating rounded card + warm pill indicator) */}
        <aside className="shrink-0 lg:w-56">
          <div className="lg:hidden">
            <SpringSegmentedControl
              variant="shell"
              value={activeSection}
              onChange={setActiveSection}
              options={navItems.map((n) => ({ value: n.id, label: n.label }))}
              className="w-full"
            />
          </div>

          <div
            ref={railRef}
            className="elevated-card relative hidden space-y-1 rounded-[28px] p-2 lg:block"
          >
            {/* Spring Sliding Active Indicator */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-2 right-2 top-0 rounded-[20px] bg-[var(--surface)] will-change-transform"
              style={{
                transform: `translateY(${railIndicator.top}px)`,
                height: `${railIndicator.height}px`,
                transition: railReady
                  ? 'transform var(--t-snap) var(--sp-snap), height var(--t-snap) var(--sp-snap)'
                  : 'none',
              }}
            />

            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[item.id] = el;
                  }}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`relative z-10 flex w-full items-start gap-2.5 rounded-[20px] px-3.5 py-3 text-left transition-colors ${
                    active ? 'text-[var(--ink)]' : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]'
                  }`}
                >
                  <span className={`mt-0.5 shrink-0 ${active ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>{item.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className="truncate text-[10px] text-[var(--ink-muted)]">{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Content Area */}
        <div key={activeSection} className="mk-capsule-switch min-w-0 flex-1 space-y-5">
          {activeSection === 'auto_switch' && autoSwitchConfig && (
            <>
              <SectionCard
                title={zh ? '自动切换' : 'Auto-Switch'}
                subtitle={
                  zh
                    ? '余量不足时自动切号，不中断当前任务'
                    : 'Switches only under safe idle/threshold rules to avoid interrupting running tasks'
                }
                right={
                  <Toggle
                    checked={autoSwitchConfig.enabled}
                    label="Enable auto-switch"
                    onChange={(enabled) =>
                      void persistAutoSwitch(
                        { ...autoSwitchConfig, enabled },
                        enabled ? (zh ? '自动切换已开启' : 'Auto-switch enabled') : (zh ? '自动切换已关闭' : 'Auto-switch disabled')
                      )
                    }
                  />
                }
              >
                <div className="space-y-4">
                  {/* Live Status Pill */}
                  {autoSwitchStatus && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {autoSwitchStatus.phase === 'monitoring' ? (
                          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                            <span className="status-ping-ring absolute inset-0 rounded-full bg-[var(--emerald)]" />
                            <span className="relative h-2 w-2 rounded-full bg-[var(--emerald)]" />
                          </span>
                        ) : (
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              autoSwitchStatus.phase === 'pending' || autoSwitchStatus.phase === 'switching'
                                ? 'bg-[var(--amber)] animate-pulse'
                                : autoSwitchStatus.phase === 'blocked'
                                  ? 'bg-[var(--rose)]'
                                  : 'bg-[var(--ink-muted)]'
                            }`}
                          />
                        )}
                        <span className="font-semibold text-[var(--ink)]">
                          {zh
                            ? (({
                                disabled: '已停用',
                                monitoring: '监控中',
                                pending: '等待切换',
                                switching: '切换中',
                                blocked: '已暂停',
                                idle: '空闲',
                                canceled: '已取消',
                                completed: '已完成',
                              } as Record<string, string>)[autoSwitchStatus.phase] ?? autoSwitchStatus.phase)
                            : `Phase: ${autoSwitchStatus.phase}`}
                        </span>
                        <span className="text-[var(--ink-secondary)]">
                          {zh
                            ? `· 客户端${
                                (({
                                  running: '运行中',
                                  idle: '空闲',
                                  stopped: '未运行',
                                  closed: '未运行',
                                  unknown: '未知',
                                } as Record<string, string>)[autoSwitchStatus.process_state] ?? autoSwitchStatus.process_state)
                              }`
                            : `(Process: ${autoSwitchStatus.process_state})`}
                        </span>
                        {autoSwitchStatus.reason && (
                          <span className="text-[var(--ink-muted)]">· {autoSwitchStatus.reason}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {autoSwitchStatus.pending_id && (
                          <button
                            type="button"
                            onClick={async () => {
                              const st = await autoSwitchService.cancelAutoSwitch(autoSwitchStatus.pending_id!);
                              setAutoSwitchStatus(st);
                              showToast(zh ? '已取消待执行切换' : 'Pending switch canceled', 'info');
                            }}
                            className="tactile-press rounded-full bg-[var(--rose-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--rose-ink)]"
                          >
                            {zh ? '取消待切换' : 'Cancel Pending'}
                          </button>
                        )}
                        <MorphActionButton
                          variant="secondary"
                          size="sm"
                          idleLabel={zh ? '立即检查' : 'Check Now'}
                          loadingLabel={zh ? '检查中' : 'Checking'}
                          successLabel={zh ? '已检查' : 'Checked'}
                          icon={<ArrowsClockwise size={13} weight="bold" />}
                          onClick={async () => {
                            const st = await autoSwitchService.checkAutoSwitchNow();
                            setAutoSwitchStatus(st);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Mode & Strategy */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 text-xs font-medium text-[var(--ink-secondary)]">
                        {zh ? '切换时机' : 'Switch Timing'}
                      </div>
                      <SpringSegmentedControl
                        value={autoSwitchConfig.mode}
                        onChange={(mode) => void persistAutoSwitch({ ...autoSwitchConfig, mode })}
                        options={[
                          { value: 'wait', label: zh ? '空闲时切换' : 'Wait (Idle Safe)' },
                          { value: 'stop', label: zh ? '立即切换' : 'Stop (Immediate)' },
                        ]}
                      />
                      <p key={autoSwitchConfig.mode} className="mk-capsule-switch mt-2 text-[11px] text-[var(--ink-muted)]">
                        {autoSwitchConfig.mode === 'wait'
                          ? zh
                            ? '客户端忙碌时先排队，生成结束后再切。'
                            : 'Queues switch until running tasks become idle.'
                          : zh
                            ? '低于阈值时直接切换，无需等待。'
                            : 'Switches immediately once quota drops below reserve threshold.'}
                      </p>
                    </div>

                    <div>
                      <div className="mb-1.5 text-xs font-medium text-[var(--ink-secondary)]">
                        {zh ? '选号方式' : 'Candidate Strategy'}
                      </div>
                      <SpringSegmentedControl<AutoSwitchStrategy>
                        value={autoSwitchConfig.strategy ?? 'round_robin'}
                        onChange={(strategy) => void persistAutoSwitch({ ...autoSwitchConfig, strategy })}
                        options={[
                          { value: 'priority', label: zh ? '按优先级' : 'Priority' },
                          { value: 'round_robin', label: zh ? '依次轮换' : 'Round-Robin' },
                        ]}
                      />
                      <p key={autoSwitchConfig.strategy ?? 'round_robin'} className="mk-capsule-switch mt-2 text-[11px] text-[var(--ink-muted)]">
                        {(autoSwitchConfig.strategy ?? 'round_robin') === 'priority'
                          ? zh
                            ? '优先选 P 值最小的账号（P1 最高）。'
                            : 'Lowest priority number first; ties follow candidate order.'
                          : zh
                            ? '按下方列表顺序轮换。'
                            : 'Cycles through checked candidates in queue order.'}
                      </p>
                    </div>
                  </div>

                  {/* Target Client, Monitored Model & Thresholds */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="block">
                      <span className="mb-1.5 block text-[11px] font-medium text-[var(--ink-secondary)]">
                        {zh ? '目标客户端' : 'Target Client'}
                      </span>
                      <DropdownSelector<AutoSwitchTarget>
                        fullWidth
                        align="left"
                        ariaLabel={zh ? '目标客户端' : 'Target Client'}
                        value={autoSwitchConfig.target}
                        onChange={(target) => void persistAutoSwitch({ ...autoSwitchConfig, target })}
                        options={[
                          { value: 'app_cli', label: 'App + CLI' },
                          { value: 'app', label: zh ? '仅 App' : 'App Only' },
                          { value: 'ide', label: 'IDE' },
                          { value: 'vscode', label: 'VS Code' },
                          { value: 'all', label: zh ? '全部客户端' : 'All Clients' },
                        ]}
                      />
                    </div>

                    <div className="block">
                      <span className="mb-1.5 block text-[11px] font-medium text-[var(--ink-secondary)]">
                        {zh ? '基准模型' : 'Monitored Model'}
                      </span>
                      <DropdownSelector<string>
                        fullWidth
                        align="left"
                        ariaLabel={zh ? '基准模型' : 'Monitored Model'}
                        value={autoSwitchConfig.monitored_model}
                        onChange={(monitored_model) =>
                          void persistAutoSwitch({ ...autoSwitchConfig, monitored_model })
                        }
                        options={modelOptions.map((m) => ({ value: m, label: m }))}
                      />
                    </div>

                    <div className="block">
                      <span className="mb-1.5 block text-[11px] font-medium text-[var(--ink-secondary)]">
                        {zh ? '触发阈值 (%)' : 'Reserve Trigger (%)'}
                      </span>
                      <SpringNumberInput
                        ariaLabel={zh ? '触发阈值' : 'Reserve Trigger'}
                        min={1}
                        max={80}
                        step={5}
                        suffix="%"
                        value={autoSwitchConfig.reserve_percentage}
                        onChange={(reserve_percentage) =>
                          void persistAutoSwitch({ ...autoSwitchConfig, reserve_percentage })
                        }
                      />
                    </div>

                    <div className="block">
                      <span className="mb-1.5 block text-[11px] font-medium text-[var(--ink-secondary)]">
                        {zh ? '备用最低余量 (%)' : 'Candidate Min (%)'}
                      </span>
                      <SpringNumberInput
                        ariaLabel={zh ? '备用最低余量' : 'Candidate Min'}
                        min={5}
                        max={95}
                        step={5}
                        suffix="%"
                        value={autoSwitchConfig.candidate_min_percentage}
                        onChange={(candidate_min_percentage) =>
                          void persistAutoSwitch({ ...autoSwitchConfig, candidate_min_percentage })
                        }
                      />
                    </div>
                  </div>

                  {/* Candidate Pool Sortable Checklist */}
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--ink-secondary)]">
                        {zh ? '候选账号（勾选加入，拖拽排序）' : 'Candidate Pool (check & drag to order)'}
                      </span>
                      <span className="tabular-nums text-[var(--ink-muted)]">
                        {autoSwitchConfig.candidate_account_ids.length} / {accounts.length}
                      </span>
                    </div>

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => void handleCandidateDragEnd(e)}
                    >
                      <SortableContext
                        items={orderedCandidateAccounts.map((a) => a.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-[20px] bg-[var(--surface-soft)] p-2">
                          {orderedCandidateAccounts.map((acc) => (
                            <SortableCandidateRow
                              key={acc.id}
                              id={acc.id}
                              email={acc.email}
                              label={acc.custom_label || acc.name}
                              tier={getAccountTier(acc)}
                              subscription={acc.quota?.subscription_tier}
                              priority={acc.priority ?? 50}
                              included={autoSwitchConfig.candidate_account_ids.includes(acc.id)}
                              onToggle={() => void toggleCandidateId(acc.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          {activeSection === 'client_network' && config && (
            <>
              {/* Client Executables */}
              <SectionCard
                title={zh ? '客户端路径' : 'Client Executable Paths'}
                subtitle={zh ? '留空则自动查找' : 'Leave blank for automatic standard path detection'}
              >
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? '主程序路径' : 'Antigravity App Path'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={config.antigravity_executable ?? ''}
                        onChange={(e) =>
                          useConfigStore.setState({ config: { ...config, antigravity_executable: e.target.value } })
                        }
                        onBlur={() => void persistConfig(config)}
                        placeholder={zh ? '自动查找...' : 'Auto-detect...'}
                        className="h-10 w-full rounded-full bg-[var(--surface)] px-4 font-mono text-xs text-[var(--ink)] outline-none transition-shadow focus:ring-1 focus:ring-[var(--border-strong)]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleBrowseExecutable('antigravity_executable')}
                        className="tactile-press h-10 shrink-0 rounded-full bg-[var(--surface)] px-4 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                      >
                        {zh ? '浏览...' : 'Browse...'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? 'IDE 路径' : 'Antigravity IDE Path'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={config.antigravity_ide_executable ?? ''}
                        onChange={(e) =>
                          useConfigStore.setState({ config: { ...config, antigravity_ide_executable: e.target.value } })
                        }
                        onBlur={() => void persistConfig(config)}
                        placeholder={zh ? '自动查找...' : 'Auto-detect...'}
                        className="h-10 w-full rounded-full bg-[var(--surface)] px-4 font-mono text-xs text-[var(--ink)] outline-none transition-shadow focus:ring-1 focus:ring-[var(--border-strong)]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleBrowseExecutable('antigravity_ide_executable')}
                        className="tactile-press h-10 shrink-0 rounded-full bg-[var(--surface)] px-4 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                      >
                        {zh ? '浏览...' : 'Browse...'}
                      </button>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Network Proxy */}
              <SectionCard
                title={zh ? '网络代理' : 'Network Proxy'}
                subtitle={zh ? '用于刷新配额和账号登录' : 'Outbound mode for quota checks, OAuth & warmup requests'}
              >
                <div className="space-y-3">
                  <SpringSegmentedControl
                    value={proxyModeDraft}
                    onChange={(proxy_mode) => void handleProxyModeChange(proxy_mode)}
                    options={[
                      { value: 'system', label: zh ? '跟随系统' : 'System' },
                      { value: 'direct', label: zh ? '直连' : 'Direct' },
                      { value: 'manual', label: zh ? '手动配置' : 'Manual' },
                    ]}
                  />

                  <SpringAccordion open={proxyModeDraft === 'manual'}>
                    <div className="pt-1">
                      <div className="flex gap-2">
                        <input
                          ref={proxyInputRef}
                          type="text"
                          value={proxyUrlDraft}
                          onChange={(e) => {
                            setProxyUrlDraft(e.target.value);
                            setProxyError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              void handleProxySave('manual', proxyUrlDraft);
                            }
                          }}
                          placeholder="http://127.0.0.1:7890"
                          className="h-10 w-full rounded-full bg-[var(--surface)] px-4 font-mono text-xs text-[var(--ink)] outline-none transition-shadow focus:ring-1 focus:ring-[var(--border-strong)]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleProxySave('manual', proxyUrlDraft)}
                          className="tactile-press h-10 shrink-0 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-5 text-xs font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)]"
                        >
                          {zh ? '应用' : 'Apply'}
                        </button>
                      </div>
                      {proxyError && <p className="mt-1.5 text-[11px] text-[var(--rose-ink)]">{proxyError}</p>}
                    </div>
                  </SpringAccordion>
                </div>
              </SectionCard>

              {/* Refresh Intervals & Quota Protection */}
              <SectionCard
                title={zh ? '刷新与限额保护' : 'Polling & Quota Protection'}
                subtitle={zh ? '定时更新配额，余量过低时暂停使用' : 'Background refresh schedule and low-quota model protection'}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-[var(--surface-soft)] p-3.5">
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink)]">
                          {zh ? '定时刷新配额' : 'Auto Refresh Quotas'}
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)]">
                          {zh ? '间隔（分钟）' : 'Refresh all accounts every N min'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <SpringNumberInput
                          ariaLabel={zh ? '后台自动刷新间隔' : 'Auto refresh interval'}
                          min={1}
                          max={120}
                          step={1}
                          suffix="m"
                          className="w-[132px]"
                          value={config.refresh_interval}
                          onChange={(refresh_interval) => void persistConfig({ ...config, refresh_interval })}
                        />
                        <Toggle
                          checked={config.auto_refresh}
                          onChange={(auto_refresh) => void persistConfig({ ...config, auto_refresh })}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-[var(--surface-soft)] p-3.5">
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink)]">
                          {zh ? '同步登录状态' : 'Auto Sync Active Client'}
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)]">
                          {zh ? '检测间隔（秒）' : 'Poll local credentials every N sec'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <SpringNumberInput
                          ariaLabel={zh ? '自动同步间隔' : 'Auto sync interval'}
                          min={5}
                          max={3600}
                          step={5}
                          suffix="s"
                          className="w-[132px]"
                          value={config.sync_interval}
                          onChange={(sync_interval) => void persistConfig({ ...config, sync_interval })}
                        />
                        <Toggle
                          checked={config.auto_sync}
                          onChange={(auto_sync) => void persistConfig({ ...config, auto_sync })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-[var(--surface-soft)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink)]">
                          {zh ? '低余量保护' : 'Low Quota Protection Guard'}
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)]">
                          {zh
                            ? '低于阈值时锁定模型，避免耗尽周期额度'
                            : 'Marks monitored models as protected when remaining quota falls below threshold'}
                        </div>
                      </div>
                      <Toggle
                        checked={config.quota_protection.enabled}
                        onChange={(enabled) =>
                          void persistConfig({
                            ...config,
                            quota_protection: { ...config.quota_protection, enabled },
                          })
                        }
                      />
                    </div>

                    <SpringAccordion open={config.quota_protection.enabled}>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-3">
                        <div className="flex flex-wrap gap-1.5">
                          {PROTECTED_MODEL_KEYS.map((item) => {
                            const active = config.quota_protection.monitored_models.includes(item.key);
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                  const next = active
                                    ? config.quota_protection.monitored_models.filter((k) => k !== item.key)
                                    : [...config.quota_protection.monitored_models, item.key];
                                  void persistConfig({
                                    ...config,
                                    quota_protection: { ...config.quota_protection, monitored_models: next },
                                  });
                                }}
                                className={`tactile-press rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                                  active
                                    ? 'bg-[var(--primary-soft)] text-[var(--primary-ink)]'
                                    : 'bg-[var(--bg-card)] text-[var(--ink-secondary)] hover:text-[var(--ink)]'
                                }`}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="inline-flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
                          <span>{zh ? '保护阈值' : 'Threshold'}:</span>
                          <SpringNumberInput
                            ariaLabel={zh ? '低配额保护阈值' : 'Protection threshold'}
                            min={1}
                            max={60}
                            step={5}
                            suffix="%"
                            className="w-[132px]"
                            value={config.quota_protection.threshold_percentage}
                            onChange={(threshold_percentage) =>
                              void persistConfig({
                                ...config,
                                quota_protection: { ...config.quota_protection, threshold_percentage },
                              })
                            }
                          />
                        </div>
                      </div>
                    </SpringAccordion>
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          {activeSection === 'display_valuation' && config && (
            <>
              {/* Theme & Language */}
              <SectionCard
                title={zh ? '外观与语言' : 'Appearance & Language'}
                subtitle={zh ? '界面主题与显示语言' : 'Warm alabaster / carbon dark themes & localization'}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? '主题外观' : 'Theme'}
                    </div>
                    <SpringSegmentedControl
                      value={config.theme || 'system'}
                      onChange={(t) => void updateTheme(t)}
                      options={[
                        { value: 'system', label: zh ? '跟随系统' : 'System' },
                        { value: 'light', label: zh ? '浅色' : 'Light' },
                        { value: 'dark', label: zh ? '深色' : 'Dark' },
                      ]}
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? '界面语言' : 'Language'}
                    </div>
                    <SpringSegmentedControl
                      value={config.language?.startsWith('en') ? 'en' : 'zh'}
                      onChange={async (lang) => {
                        await i18n.changeLanguage(lang);
                        await updateLanguage(lang);
                      }}
                      options={[
                        { value: 'zh', label: '简体中文' },
                        { value: 'en', label: 'English' },
                      ]}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* API Value Valuation */}
              <SectionCard
                title={zh ? 'API 价值折算' : 'API Value Valuation'}
                subtitle={zh ? '按官方单价估算剩余额度' : 'Convert quota remaining % into estimated USD / CNY API value'}
                right={
                  <Toggle
                    checked={valuationCfg.enabled}
                    onChange={(enabled) =>
                      void persistConfig({ ...config, quota_valuation: { ...valuationCfg, enabled } })
                    }
                  />
                }
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? '计价币种' : 'Currency'}
                    </div>
                    <SpringSegmentedControl
                      size="sm"
                      value={valuationCfg.currency}
                      onChange={(currency) =>
                        void persistConfig({ ...config, quota_valuation: { ...valuationCfg, currency } })
                      }
                      options={[
                        { value: 'usd', label: 'USD' },
                        { value: 'cny', label: 'CNY' },
                        { value: 'both', label: zh ? '双币' : 'Both' },
                      ]}
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? '展示口径' : 'Display Mode'}
                    </div>
                    <SpringSegmentedControl
                      size="sm"
                      value={valuationCfg.display_mode}
                      onChange={(display_mode) =>
                        void persistConfig({ ...config, quota_valuation: { ...valuationCfg, display_mode } })
                      }
                      options={[
                        { value: 'remaining', label: zh ? '剩余值' : 'Remaining' },
                        { value: 'used_and_total', label: zh ? '已用 / 总额' : 'Used / Total' },
                      ]}
                    />
                  </div>

                  <div className="block">
                    <span className="mb-1.5 block text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? '参考汇率 (USD → CNY)' : 'USD → CNY Rate'}
                    </span>
                    <SpringNumberInput
                      ariaLabel={zh ? '参考汇率' : 'USD to CNY Rate'}
                      step={0.05}
                      precision={2}
                      min={1}
                      max={20}
                      value={valuationCfg.usd_to_cny_rate}
                      onChange={(usd_to_cny_rate) =>
                        void persistConfig({
                          ...config,
                          quota_valuation: { ...valuationCfg, usd_to_cny_rate },
                        })
                      }
                    />
                  </div>
                </div>
              </SectionCard>

              {/* Tray / MenuBar Preferences */}
              <SectionCard
                title={zh ? '托盘面板' : 'Tray Popover Preferences'}
                subtitle={zh ? '设置托盘面板的显示内容' : 'Customize quick-switch tray scope, reset timers & status colors'}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? '显示配额' : 'Aggregate Quota Scope'}
                    </div>
                    <SpringSegmentedControl<MenuBarQuotaScope>
                      size="sm"
                      value={menuBar.quota_scope}
                      onChange={(quota_scope) => void updateMenuBar({ quota_scope, display_scope: quota_scope })}
                      options={[
                        { value: 'all', label: zh ? '全部' : 'All' },
                        { value: 'gemini', label: 'Gemini' },
                        { value: 'other', label: 'Claude/GPT' },
                      ]}
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? '重置时间' : 'Reset Time Display'}
                    </div>
                    <SpringSegmentedControl<MenuBarResetTimeDisplay>
                      size="sm"
                      value={menuBar.reset_time_display ?? (menuBar.show_reset_on_hover === false ? 'hidden' : 'hover')}
                      onChange={(reset_time_display) => void updateMenuBar({ reset_time_display })}
                      options={[
                        { value: 'always', label: zh ? '始终显示' : 'Always' },
                        { value: 'hover', label: zh ? '悬停显示' : 'Hover' },
                        { value: 'hidden', label: zh ? '隐藏' : 'Hidden' },
                      ]}
                    />
                  </div>

                  <div className="block">
                    <span className="mb-1.5 block text-xs font-medium text-[var(--ink-secondary)]">
                      {zh ? '名称格式' : 'Account Label Format'}
                    </span>
                    <DropdownSelector<NonNullable<MenuBarPreferences['label_style']>>
                      fullWidth
                      align="left"
                      ariaLabel={zh ? '账号名称显示格式' : 'Account Label Format'}
                      value={menuBar.label_style ?? 'email_then_label'}
                      onChange={(label_style) => void updateMenuBar({ label_style })}
                      options={[
                        { value: 'email_then_label', label: zh ? '邮箱 + 备注' : 'Email + Label' },
                        { value: 'label_then_email', label: zh ? '备注优先 + 邮箱' : 'Label + Email' },
                        { value: 'email_only', label: zh ? '仅邮箱' : 'Email Only' },
                      ]}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-[18px] bg-[var(--surface-soft)] px-4 py-2.5">
                    <span className="text-xs font-medium text-[var(--ink)]">
                      {zh ? '隐藏不可用账号' : 'Hide Disabled / Blocked'}
                    </span>
                    <Toggle
                      checked={Boolean(menuBar.hide_unavailable ?? true)}
                      onChange={(hide_unavailable) => void updateMenuBar({ hide_unavailable })}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* App Translation Experiment */}
              <SectionCard
                title={zh ? '客户端汉化（实验性）' : 'Experimental: Antigravity UI Translation'}
                subtitle={zh ? '将客户端界面替换为中文' : 'Automatically localize supported Antigravity desktop UI strings'}
                right={
                  <Toggle
                    checked={Boolean(experiments?.translation_enabled)}
                    onChange={async (enabled) => {
                      try {
                        const result = await configService.setAppTranslation(enabled);
                        const nextVal = typeof result === 'boolean' ? result : enabled;
                        setExperiments((prev) => ({ ...prev, translation_enabled: nextVal }));
                        showToast(
                          nextVal
                            ? zh ? '已开启客户端中文增强' : 'App translation enabled'
                            : zh ? '已还原客户端原始语言' : 'App translation disabled',
                          'success'
                        );
                      } catch (e) {
                        showToast(String(e), 'error');
                      }
                    }}
                  />
                }
              >
                <div className="flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
                  <Translate size={15} className="text-[var(--accent)]" />
                  <span>
                    {experiments?.available
                      ? zh
                        ? `已连接到客户端 (${experiments.version || '未知版本'}) · 已替换 ${experiments.translated ?? 0} 处文案`
                        : `Connected (${experiments.version || 'unknown'}) · ${experiments.translated ?? 0} translated`
                      : zh
                        ? '未检测到运行中的客户端，连接后自动生效。'
                        : 'Waiting for supported running Antigravity instance.'}
                  </span>
                </div>
              </SectionCard>
            </>
          )}

          {activeSection === 'desktop_data' && (
            <>
              <SectionCard
                title={zh ? '启动与托盘' : 'Desktop & Startup Behavior'}
                subtitle={zh ? '开机自启与窗口行为' : 'Configure launch at login and background startup behavior'}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-[18px] bg-[var(--surface-soft)] px-4 py-3">
                    <div>
                      <div className="text-xs font-semibold text-[var(--ink)]">
                        {zh ? '开机自动启动' : 'Launch at Login'}
                      </div>
                      <div className="text-[11px] text-[var(--ink-muted)]">
                        {desktopStatus?.autostart_supported === false
                          ? zh ? '仅打包后的正式版本支持' : 'Available in installed release builds'
                          : zh ? '登录系统后自动启动' : 'Start automatically after OS login'}
                      </div>
                    </div>
                    <Toggle
                      checked={Boolean(desktopStatus?.launch_at_login)}
                      disabled={desktopStatus?.autostart_supported === false}
                      onChange={(launch_at_login) => void handleDesktopPatch({ launch_at_login })}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-[18px] bg-[var(--surface-soft)] px-4 py-3">
                    <div>
                      <div className="text-xs font-semibold text-[var(--ink)]">
                        {zh ? '启动时最小化到托盘' : 'Start Minimized to Tray'}
                      </div>
                      <div className="text-[11px] text-[var(--ink-muted)]">
                        {zh ? '启动后驻留托盘，不弹窗' : 'Keep main window hidden on launch'}
                      </div>
                    </div>
                    <Toggle
                      checked={Boolean(desktopStatus?.start_minimized)}
                      onChange={(start_minimized) => void handleDesktopPatch({ start_minimized })}
                    />
                  </div>

                  {desktopStatus?.platform === 'macos' && (
                    <div className="flex items-center justify-between rounded-[18px] bg-[var(--surface-soft)] px-4 py-3">
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink)]">
                          {zh ? '隐藏 macOS Dock 图标' : 'Hide macOS Dock Icon'}
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)]">
                          {zh ? '仅通过顶部菜单栏托盘访问' : 'Menu bar accessory mode'}
                        </div>
                      </div>
                      <Toggle
                        checked={Boolean(desktopStatus?.hide_dock_icon)}
                        onChange={(hide_dock_icon) => void handleDesktopPatch({ hide_dock_icon })}
                      />
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title={zh ? '数据与版本' : 'Data Directory & Version'}
                subtitle={
                  zh
                    ? '兼容 ~/.antigravity_tools 数据结构（支持 ABV_DATA_DIR）'
                    : 'Uses the ~/.antigravity_tools account format. Set ABV_DATA_DIR to use a separate directory.'
                }
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-[var(--surface-soft)] px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-[var(--ink-muted)]">
                        {zh ? '数据目录' : 'Active Data Path'}
                      </div>
                      <div className="truncate font-mono text-xs text-[var(--ink)]">{dataDir}</div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await configService.openDataFolder();
                        } catch (e) {
                          showToast(String(e), 'error');
                        }
                      }}
                      className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--bg-card)] px-3.5 text-xs font-medium text-[var(--ink)] shadow-2xs hover:bg-[var(--surface-hover)]"
                    >
                      <FolderOpen size={14} weight="bold" />
                      <span>{zh ? '打开目录' : 'Open Folder'}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[var(--surface-soft)] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Desktop size={18} className="text-[var(--ink-secondary)]" />
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink)]">
                          AgyFlux v{runningVersion}
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)]">
                          {updateInfo?.enabled === false
                            ? zh ? '尚未配置更新源' : 'No update channel configured'
                            : updateInfo?.has_update
                            ? zh
                              ? `发现新版本 v${updateInfo.latest_version}`
                              : `New version v${updateInfo.latest_version} available`
                            : zh
                              ? '点击检查新版本'
                              : 'Check latest release'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {updateInfo?.has_update && updateInfo.release_url && (
                        <button
                          type="button"
                          onClick={() => void updaterService.openRelease(updateInfo.release_url)}
                          className="tactile-press inline-flex h-9 items-center gap-1 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-3.5 text-xs font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)]"
                        >
                          <CloudArrowDown size={14} weight="bold" />
                          <span>{zh ? '查看发布' : 'View Release'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isChecking || updateInfo?.enabled === false}
                        onClick={async () => {
                          await checkForUpdates(false);
                          const info = useUpdateStore.getState().updateInfo;
                          if (info?.enabled === false) {
                            showToast(zh ? '尚未配置此版本的更新发布源' : 'No update channel configured for this build', 'info');
                          } else if (info && !info.has_update) {
                            showToast(zh ? '当前已是最新版本' : 'Already up to date', 'success');
                          }
                        }}
                        className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--bg-card)] px-3.5 text-xs font-medium text-[var(--ink)] shadow-2xs hover:bg-[var(--surface-hover)] disabled:opacity-50"
                      >
                        <CheckCircle size={14} className={isChecking ? 'animate-spin' : ''} />
                        <span>{isChecking ? (zh ? '检查中...' : 'Checking...') : zh ? '检查更新' : 'Check Updates'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>

      {/* Loading Fallback */}
      {!config && (
        <div className="flex items-center gap-2 rounded-[24px] border border-[var(--border-hairline)] bg-[var(--bg-card)] px-4 py-3 text-xs text-[var(--ink-secondary)]">
          <SlidersHorizontal size={15} />
          <span>{zh ? '正在加载配置...' : 'Loading configuration...'}</span>
        </div>
      )}
    </div>
  );
}
