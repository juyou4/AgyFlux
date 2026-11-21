import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ArrowSquareOut,
  ArrowsClockwise,
  ArrowsLeftRight,
  CaretDown,
  Check,
  CheckCircle,
  ClockCountdown,
  DotsSixVertical,
  Export,
  Fingerprint,
  Fire,
  Plus,
  ShieldWarning,
  SlidersHorizontal,
  SquaresFour,
  Swap,
  Trash,
  List as ListIcon,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAccountStore } from '../stores/useAccountStore';
import { useConfigStore } from '../stores/useConfigStore';
import { AddAccountDialog } from '../components/accounts/AddAccountDialog';
import { DeviceFingerprintModal } from '../components/accounts/DeviceFingerprintModal';
import { AccountsSkeleton } from '../components/accounts/AccountsSkeleton';
import { AccountTierBadge } from '../components/accounts/AccountTierBadge';
import { SpringSegmentedControl } from '../components/motion/SpringSegmentedControl';
import { ExpandableSearchPill } from '../components/motion/ExpandableSearchPill';
import { MorphActionButton } from '../components/motion/MorphActionButton';
import { MorphActionMenu } from '../components/motion/MorphActionMenu';
import { HoldToConfirmButton } from '../components/motion/HoldToConfirmButton';
import { SpringAccordion } from '../components/motion/SpringAccordion';
import { SpringMeter } from '../components/motion/SpringMeter';
import { DropdownSelector } from '../components/motion/DropdownSelector';
import { CopyPillButton } from '../components/motion/CopyPillButton';
import { WaveRevealContainer } from '../components/motion/WaveRevealContainer';
import { SpringCheckbox } from '../components/motion/SpringCheckbox';
import { SpringNumberInput } from '../components/motion/SpringNumberInput';
import { showToast } from '../components/motion/SpringToast';
import { getAccountTier, type AccountTier } from '../utils/accountTier';
import {
  extractPoolWindow,
  findExpiringAccounts,
  formatShortCountdown,
} from '../utils/accountInsights';
import {
  findBucketFor5h,
  findBucketForWeekly,
  formatValuationDisplay,
  type AccountQuotaValuation,
  type QuotaValuationResponse,
} from '../utils/quotaValuation';
import { accountModelQuotaRows, weeklyQuotaItems } from '../utils/menuBarQuota';
import { formatCurrencyCompact, type CurrencyMode } from '../utils/currency';
import { copyToClipboard } from '../utils/clipboard';
import { isTauri } from '../utils/env';
import { request } from '../utils/request';
import * as accountService from '../services/accountService';
import type { Account } from '../types/account';

import { clientIdentity } from '../utils/clientIdentity';

type TierFilter = 'all' | AccountTier;
type PoolWindow = '5h' | 'weekly';
type ViewMode = 'cards' | 'list';
type SwitchTarget = 'classic' | 'ide' | 'agy' | 'vscode' | 'all';

function meterColor(value: number | null) {
  if (value === null) return 'bg-[var(--border-strong)]';
  if (value > 60) return 'bg-[var(--emerald)]';
  if (value >= 20) return 'bg-[var(--amber)]';
  return 'bg-[var(--rose)]';
}

function MeterBar({ value }: { value: number | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <SpringMeter
      value={value === null ? null : pct}
      fillClassName={meterColor(value)}
      className="h-[7px] w-full bg-[var(--surface)] transition-[height] duration-200 group-hover/meter:h-[8.5px]"
    />
  );
}

async function openExternalUrl(url: string) {
  if (isTauri()) {
    try {
      await request('plugin:opener|open_url', { url });
      return;
    } catch {
      // Fallback to browser open
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function triggerJsonDownload(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface SortableRowWrapperProps {
  id: string;
  disabled: boolean;
  children: (handleProps: {
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
    isDragging: boolean;
  }) => React.ReactNode;
}

function SortableRowWrapper({ id, disabled, children }: SortableRowWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
    >
      {children({ attributes, listeners, isDragging })}
    </div>
  );
}

interface AccountDetailsProps {
  account: Account;
  poolWindow: PoolWindow;
  zh: boolean;
  compact?: boolean;
  onRefresh: (id: string) => Promise<void>;
  onWarmup: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenFingerprint: (acc: Account) => void;
  onExportSingle: (acc: Account) => Promise<void>;
  onSaveLabel: (id: string, label: string) => Promise<void>;
  onSavePriority: (id: string, priority: number) => Promise<void>;
  onSaveProjectId: (id: string, projectId: string | null) => Promise<void>;
  onAutoFetchProject: (id: string) => Promise<string>;
}

function AccountDetailsDrawer({
  account,
  poolWindow,
  zh,
  compact = false,
  onRefresh,
  onDelete,
  onOpenFingerprint,
  onSaveLabel,
  onSavePriority,
  onSaveProjectId,
  onAutoFetchProject,
}: AccountDetailsProps) {
  const [drawerTab, setDrawerTab] = useState<'models' | 'config'>('models');
  const [labelDraft, setLabelDraft] = useState(account.custom_label ?? '');
  const [priorityDraft, setPriorityDraft] = useState(String(account.priority ?? 50));
  const [projectDraft, setProjectDraft] = useState(account.token.project_id ?? '');
  const [fetchingProject, setFetchingProject] = useState(false);

  useEffect(() => {
    setLabelDraft(account.custom_label ?? '');
    setPriorityDraft(String(account.priority ?? 50));
    setProjectDraft(account.token.project_id ?? '');
  }, [account.id, account.custom_label, account.priority, account.token.project_id]);

  const models = useMemo(() => accountModelQuotaRows(account, poolWindow), [account, poolWindow]);

  const handleAutoProject = async () => {
    setFetchingProject(true);
    try {
      const pid = await onAutoFetchProject(account.id);
      setProjectDraft(pid);
    } finally {
      setFetchingProject(false);
    }
  };

  return (
    <div className="mt-3 rounded-[22px] bg-[var(--surface-soft)] p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SpringSegmentedControl
          size="sm"
          value={drawerTab}
          onChange={setDrawerTab}
          options={[
            {
              value: 'models',
              label: zh ? '模型余量' : 'Models',
              badge: models.length || undefined,
            },
            {
              value: 'config',
              label: zh ? '账号配置' : 'Settings',
            },
          ]}
        />
        <span className="font-mono text-[11px] text-[var(--ink-muted)]">
          {poolWindow === '5h' ? '5H' : zh ? '每周' : 'Weekly'}
        </span>
      </div>

      {drawerTab === 'models' ? (
        <div key="models" className="mk-capsule-switch">
          {models.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-[16px] bg-[var(--bg-card)] px-3.5 py-3 text-xs text-[var(--ink-muted)]">
              <span>{account.quota?.model_catalog_known
                ? (zh ? '当前账号未返回可选模型。' : 'No selectable models were returned for this account.')
                : (zh ? '刷新配额以获取此账号的可选模型。' : 'Refresh quota to load the models available to this account.')}</span>
              <MorphActionButton variant="ghost" size="sm" onClick={() => onRefresh(account.id)}
                idleLabel={zh ? '刷新配额' : 'Refresh quota'} loadingLabel={zh ? '刷新中' : 'Refreshing'}
                successLabel={zh ? '已刷新' : 'Refreshed'} />
            </div>
          ) : (
            <div className={compact ? 'space-y-1.5' : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'}>
              {models.map((row, modelIdx) => {
                const pct = row.percentage;
                const clamped = Math.max(0, Math.min(100, Math.round(pct ?? 0)));
                const barColor =
                  pct === null
                    ? 'bg-[var(--border-strong)]'
                    : pct > 60
                      ? 'bg-[var(--emerald)]'
                      : pct >= 20
                        ? 'bg-[var(--amber)]'
                        : 'bg-[var(--rose)]';
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-2.5 rounded-[16px] bg-[var(--bg-card)] px-3.5 py-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-[var(--ink)]">{row.label}</div>
                        {row.levels.length > 1 && <div className="text-[10px] text-[var(--ink-muted)]">{row.levels.join(' · ')}</div>}
                      </div>
                      {row.protected && (
                        <ShieldWarning size={12} className="shrink-0 text-[var(--amber)]" weight="fill" />
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)]">
                        {row.window !== poolWindow && (zh ? '周额度 · ' : 'Weekly · ')}
                        {row.resetTime ? formatShortCountdown(row.resetTime) : '--'}
                      </span>
                      <SpringMeter
                        value={pct === null ? null : clamped}
                        fillClassName={barColor}
                        index={modelIdx}
                        className="h-1 w-12 bg-[var(--surface)]"
                      />
                      <span
                        className={`w-8 text-right text-xs font-semibold tabular-nums ${
                          pct === null
                            ? 'text-[var(--ink-muted)]'
                            : pct > 60
                              ? 'text-[var(--emerald-ink)]'
                              : pct >= 20
                                ? 'text-[var(--amber-ink)]'
                                : 'text-[var(--rose-ink)]'
                        }`}
                      >
                        {pct === null ? '--' : `${Math.round(pct)}%`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div key="config" className="mk-capsule-switch space-y-3">
          <div className={compact ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-1 gap-3 sm:grid-cols-3'}>
            <label className="block">
              <span className="mb-1 block px-1 text-[11px] font-medium text-[var(--ink-secondary)]">
                {zh ? '备注' : 'Label'}
              </span>
              <input
                type="text"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={() => {
                  if (labelDraft.trim() !== (account.custom_label ?? '')) {
                    void onSaveLabel(account.id, labelDraft.trim());
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void onSaveLabel(account.id, labelDraft.trim());
                  }
                }}
                placeholder={zh ? '如 主力 Ultra' : 'e.g. Primary'}
                className="h-10 w-full rounded-full bg-[var(--bg-card)] px-4 text-xs text-[var(--ink)] outline-none transition-shadow focus:ring-1 focus:ring-[var(--border-strong)]"
              />
            </label>

            <div className="block">
              <span className="mb-1 block px-1 text-[11px] font-medium text-[var(--ink-secondary)]">
                {zh ? '优先级' : 'Priority'}
              </span>
              <SpringNumberInput
                ariaLabel={zh ? '调度优先级' : 'Priority'}
                value={Math.max(1, Math.min(100, Math.round(Number(priorityDraft) || 50)))}
                min={1}
                max={100}
                step={5}
                className="bg-[var(--bg-card)]"
                onChange={(next) => {
                  setPriorityDraft(String(next));
                  if (next !== (account.priority ?? 50)) {
                    void onSavePriority(account.id, next);
                  }
                }}
              />
            </div>

            <div className={compact ? 'col-span-2 block' : 'block'}>
              <span className="mb-1 block px-1 text-[11px] font-medium text-[var(--ink-secondary)]">
                GCP Project ID
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={projectDraft}
                  onChange={(e) => setProjectDraft(e.target.value)}
                  onBlur={() => {
                    const next = projectDraft.trim() || null;
                    if ((next ?? '') !== (account.token.project_id ?? '')) {
                      void onSaveProjectId(account.id, next);
                    }
                  }}
                  placeholder={zh ? '未设置' : 'Not set'}
                  className="h-10 min-w-0 flex-1 rounded-full bg-[var(--bg-card)] px-4 font-mono text-xs text-[var(--ink)] outline-none transition-shadow focus:ring-1 focus:ring-[var(--border-strong)]"
                />
                <button
                  type="button"
                  onClick={() => void handleAutoProject()}
                  disabled={fetchingProject}
                  title={zh ? '自动获取 GCP Project ID' : 'Auto-fetch GCP Project ID'}
                  className="tactile-press h-10 shrink-0 rounded-full bg-[var(--bg-card)] px-4 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50"
                >
                  {fetchingProject ? '...' : zh ? '自动获取' : 'Fetch'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onOpenFingerprint(account)}
              className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--bg-card)] px-3.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--bg-card-hover)]"
            >
              <Fingerprint size={14} weight="bold" />
              <span>{zh ? '设备指纹' : 'Device ID'}</span>
            </button>

            <HoldToConfirmButton
              onConfirm={() => onDelete(account.id)}
              label={zh ? '按住移除' : 'Hold to Delete'}
              holdingLabel={zh ? '继续按住...' : 'Keep holding...'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Accounts() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');

  const {
    accounts,
    activeClients,
    loading,
    hasLoadedAccounts,
    error,
    fetchAccounts,
    switchAccount,
    refreshQuota,
    refreshAllQuotas,
    deleteAccount,
    deleteAccounts,
    reorderAccounts,
    updateAccountLabel,
    updateAccountPriority,
    updateAccountProjectId,
    autoFetchAccountProjectId,
    warmUpAccount,
    warmUpAllAccounts,
  } = useAccountStore();

  const config = useConfigStore((s) => s.config);

  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [poolWindow, setPoolWindow] = useState<PoolWindow>('5h');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [switchTarget, setSwitchTarget] = useState<SwitchTarget>('classic');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [fingerprintAccount, setFingerprintAccount] = useState<Account | null>(null);
  const [valuations, setValuations] = useState<QuotaValuationResponse | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const switchingRef = useRef(false);
  const [refreshWaveKey, setRefreshWaveKey] = useState(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadValuations = useCallback(async () => {
    try {
      const res = await request<QuotaValuationResponse>('get_account_quota_valuations').catch(() => null);
      if (res) setValuations(res);
    } catch {
      // Optional enrichment
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
    void loadValuations();
  }, [fetchAccounts, loadValuations]);

  const expiringMap = useMemo(() => {
    const map = new Map<string, { label: string; hoursLeft: number; remaining: number }>();
    for (const item of findExpiringAccounts(accounts)) {
      const prev = map.get(item.account.id);
      if (!prev || item.hoursLeft < prev.hoursLeft) {
        map.set(item.account.id, {
          label: item.family === 'gemini' ? 'Gemini' : 'Claude / GPT',
          hoursLeft: item.hoursLeft,
          remaining: item.weeklyRemaining,
        });
      }
    }
    return map;
  }, [accounts]);

  const valuationById = useMemo(() => {
    const map = new Map<string, AccountQuotaValuation>();
    for (const row of valuations?.accounts || []) {
      map.set(row.account_id, row);
    }
    return map;
  }, [valuations]);

  const tierCounts = useMemo(() => {
    const counts: Record<AccountTier, number> = { ultra: 0, pro: 0, free: 0, unknown: 0 };
    for (const acc of accounts) {
      counts[getAccountTier(acc)] += 1;
    }
    return counts;
  }, [accounts]);

  const isFiltered = searchQuery.trim().length > 0 || tierFilter !== 'all';

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((acc) => {
      const tier = getAccountTier(acc);
      if (tierFilter !== 'all' && tier !== tierFilter) return false;
      if (!q) return true;
      const hay = [acc.email, acc.name, acc.custom_label, acc.token.project_id, tier]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [accounts, searchQuery, tierFilter]);

  const activeLabelsForAccount = useCallback(
    (accountId: string) => {
      const tags: { key: string; label: string; live: boolean; hint: string }[] = [];
      for (const [target, label] of [['classic', 'App'], ['ide', 'IDE'], ['agy', 'CLI']] as const) {
        const identity = clientIdentity(activeClients, target);
        if (identity.accountId === accountId) {
          const live = identity.source === 'running_app';
          tags.push({
            key: target,
            label,
            live,
            hint: live
              ? zh ? `${label} 当前运行中` : `${label} running`
              : zh ? `${label} 已保存本地凭据` : `${label} saved credentials`,
          });
        }
      }
      return tags;
    },
    [activeClients, zh]
  );

  const isAccountActiveForTarget = useCallback(
    (accountId: string) => {
      const classicId = clientIdentity(activeClients, 'classic').accountId;
      const ideId = clientIdentity(activeClients, 'ide').accountId;
      const agyId = clientIdentity(activeClients, 'agy').accountId;
      if (switchTarget === 'ide') return ideId === accountId;
      if (switchTarget === 'agy') return agyId === accountId;
      if (switchTarget === 'all') {
        return classicId === accountId && ideId === accountId && agyId === accountId;
      }
      if (switchTarget === 'vscode') return false;
      return classicId === accountId;
    },
    [activeClients, switchTarget]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (filteredAccounts.length === 0) return;
    const allSelected = filteredAccounts.every((a) => selectedIds.has(a.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAccounts.map((a) => a.id)));
    }
  };

  const handleSwitch = async (acc: Account) => {
    if (switchingRef.current) throw new Error(zh ? '正在切换账号，请稍候' : 'An account switch is already in progress');
    switchingRef.current = true;
    setSwitchingId(acc.id);
    try {
      const target = switchTarget === 'classic' ? 'app' : switchTarget;
      await switchAccount(acc.id, target);
      showToast(
        zh ? `已切换 ${acc.custom_label || acc.email}` : `Switched to ${acc.custom_label || acc.email}`,
        'success'
      );
    } catch (e) {
      showToast(String(e), 'error');
      // 交给形变按钮呈现失败与重试，不能把失败显示为完成。
      throw e;
    } finally {
      switchingRef.current = false;
      setSwitchingId(null);
    }
  };

  const handleRefreshOne = async (id: string) => {
    try {
      await refreshQuota(id);
      await loadValuations();
      setRefreshWaveKey((k) => k + 1);
      showToast(zh ? '配额已刷新' : 'Quota refreshed', 'success');
    } catch (e) {
      showToast(String(e), 'error');
      throw e;
    }
  };

  const handleRefreshAll = async () => {
    try {
      const stats = await refreshAllQuotas();
      await loadValuations();
      setRefreshWaveKey((k) => k + 1);
      showToast(
        zh
          ? `刷新完成：成功 ${stats.success} / 共 ${stats.total}`
          : `Refreshed ${stats.success}/${stats.total} accounts`,
        stats.failed > 0 ? 'info' : 'success'
      );
    } catch (e) {
      showToast(String(e), 'error');
      throw e;
    }
  };

  const handleWarmupOne = async (id: string) => {
    try {
      const msg = await warmUpAccount(id);
      showToast(msg || (zh ? '账号预热完成' : 'Account warmed up'), 'success');
    } catch (e) {
      showToast(String(e), 'error');
      throw e;
    }
  };

  const handleWarmupAll = async () => {
    try {
      const msg = await warmUpAllAccounts();
      showToast(msg || (zh ? '全部账号预热完成' : 'All accounts warmed up'), 'success');
    } catch (e) {
      showToast(String(e), 'error');
      throw e;
    }
  };

  const handleDeleteOne = async (id: string) => {
    try {
      await deleteAccount(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (expandedId === id) setExpandedId(null);
      showToast(zh ? '账号已移除' : 'Account removed', 'success');
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  const handleBatchDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    try {
      await deleteAccounts(ids);
      setSelectedIds(new Set());
      showToast(zh ? `已删除 ${ids.length} 个账号` : `Deleted ${ids.length} accounts`, 'success');
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  const handleExport = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const res = await accountService.exportAccounts(ids);
      triggerJsonDownload(`antigravity-accounts-${ids.length}.json`, res);
      await copyToClipboard(JSON.stringify(res, null, 2));
      showToast(
        zh
          ? `已导出并复制 ${res.accounts.length} 个账号 JSON v2`
          : `Exported & copied ${res.accounts.length} accounts (JSON v2)`,
        'success'
      );
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  const renderSwitchButton = (account: Account, isActive: boolean) => (
    <MorphActionButton
      variant={isActive ? 'secondary' : 'primary'}
      idleLabel={isActive ? (zh ? '使用中' : 'In Use') : (zh ? '切换' : 'Switch')}
      loadingLabel={isActive ? (zh ? '同步中' : 'Syncing') : (zh ? '切换中' : 'Switching')}
      successLabel={isActive ? (zh ? '已同步' : 'Synced') : (zh ? '已切换' : 'Switched')}
      errorLabel={zh ? '失败 · 重试' : 'Retry switch'}
      title={
        isActive
          ? zh
            ? '当前正在使用，点击可重新同步凭据'
            : 'Currently in use — click to re-sync credentials'
          : zh
            ? `切换至 ${account.custom_label || account.email}`
            : `Switch to ${account.custom_label || account.email}`
      }
      icon={
        isActive ? (
          <Check size={13} weight="bold" />
        ) : (
          <ArrowsLeftRight size={13} weight="bold" />
        )
      }
      disabled={switchingId !== null && switchingId !== account.id}
      pending={switchingId === account.id}
      onClick={() => handleSwitch(account)}
      className="shrink-0"
    />
  );

  const renderQuickMenu = (account: Account) => (
    <MorphActionMenu
      label={zh ? `${account.custom_label || account.email} 的更多操作` : `More actions for ${account.custom_label || account.email}`}
      title={account.custom_label || account.email}
      closeLabel={zh ? '关闭操作菜单' : 'Close menu'}
      disabled={switchingId !== null}
      items={[
        {
          id: 'details',
          label: expandedId === account.id ? (zh ? '收起详情' : 'Hide details') : (zh ? '展开详情' : 'Account details'),
          icon: <SlidersHorizontal size={15} weight="bold" />,
          onSelect: () => setExpandedId(expandedId === account.id ? null : account.id),
        },
        {
          id: 'refresh',
          label: zh ? '刷新配额' : 'Refresh quota',
          icon: <ArrowsClockwise size={15} weight="bold" />,
          onSelect: () => handleRefreshOne(account.id),
        },
        {
          id: 'warmup',
          label: zh ? '预热账号' : 'Warm up',
          icon: <Fire size={15} weight="bold" />,
          onSelect: () => handleWarmupOne(account.id),
        },
        {
          id: 'fingerprint',
          label: zh ? '设备指纹' : 'Device ID',
          icon: <Fingerprint size={15} weight="bold" />,
          onSelect: () => setFingerprintAccount(account),
        },
        {
          id: 'export',
          label: zh ? '导出 JSON' : 'Export JSON',
          icon: <Export size={15} weight="bold" />,
          onSelect: () => handleExport([account.id]),
        },
        {
          id: 'delete',
          label: zh ? '移除账号' : 'Remove account',
          icon: <Trash size={15} weight="bold" />,
          tone: 'danger',
          dividerBefore: true,
          onSelect: () => handleDeleteOne(account.id),
        },
      ]}
    />
  );

  const handleBatchWarmup = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    let ok = 0;
    for (const id of ids) {
      try {
        await accountService.warmUpAccount(id);
        ok += 1;
      } catch {
        // continue remaining accounts
      }
    }
    await fetchAccounts(true);
    showToast(
      zh ? `批量预热完成：${ok}/${ids.length}` : `Batch warmup finished: ${ok}/${ids.length}`,
      ok === ids.length ? 'success' : 'info'
    );
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || isFiltered) return;
    const oldIndex = accounts.findIndex((a) => a.id === active.id);
    const newIndex = accounts.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(accounts, oldIndex, newIndex).map((a) => a.id);
    try {
      await reorderAccounts(nextOrder);
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  const valuationDisplayForPool = (
    accId: string,
    pool: 'gemini' | 'other' | 'argon' | 'carbon',
    win: PoolWindow
  ) => {
    if (config?.quota_valuation?.enabled === false) return null;
    const valAcc = valuationById.get(accId);
    if (!valAcc?.buckets?.length) return null;
    const vPool = pool === 'other' ? 'third_party' : pool;
    const currencyMode: CurrencyMode = config?.quota_valuation?.currency ?? 'usd';
    const displayMode = config?.quota_valuation?.display_mode ?? 'remaining';

    // Guard against legacy or partial bucket shapes lacking bucket_id / window
    const structuredBuckets = valAcc.buckets.filter(
      (b) => typeof b.bucket_id === 'string' && typeof b.window === 'string'
    );
    const exactBucket = structuredBuckets.length
      ? win === 'weekly'
        ? findBucketForWeekly(
            structuredBuckets,
            vPool === 'gemini'
              ? 'gemini-weekly'
              : vPool === 'third_party'
                ? '3p-weekly'
                : `gemini-${vPool}-wtu-weekly`
          ) || structuredBuckets.find((b) => b.pool === vPool && b.window.toLowerCase().includes('week'))
        : findBucketFor5h(structuredBuckets, vPool, pool === 'argon' ? 'weekly' : '5h')
      : undefined;

    if (exactBucket && exactBucket.provenance) {
      return formatValuationDisplay(exactBucket, currencyMode, displayMode, zh);
    }

    // Fallback when lightweight mock returns remaining_usd
    const legacy = valAcc.buckets.find((b) => {
      const k = ((b as unknown as { bucket_key?: string }).bucket_key || b.bucket_id || '').toLowerCase();
      const targetKey =
        pool === 'gemini'
          ? `gemini-${win}`
          : pool === 'other'
            ? `3p-${win}`
            : pool;
      return k.includes(targetKey);
    }) as unknown as { remaining_usd?: number } | undefined;

    if (legacy?.remaining_usd != null) {
      return {
        line: `≈ ${formatCurrencyCompact(legacy.remaining_usd, legacy.remaining_usd * 7.25, currencyMode)}`,
        title: zh ? '估算剩余 API 等效额度' : 'Estimated remaining API value',
      };
    }
    return null;
  };

  const renderPoolMeters = (acc: Account, compact = false) => {
    const gemini5h = extractPoolWindow(acc, 'gemini', '5h');
    const geminiWeek = extractPoolWindow(acc, 'gemini', 'weekly');
    const other5h = extractPoolWindow(acc, 'other', '5h');
    const otherWeek = extractPoolWindow(acc, 'other', 'weekly');
    const argonWeek = extractPoolWindow(acc, 'argon', 'weekly');
    const carbon5h = extractPoolWindow(acc, 'carbon', '5h');
    const carbonWeek = extractPoolWindow(acc, 'carbon', 'weekly');
    const extraWeekly = weeklyQuotaItems(acc.quota).filter(
      (item) =>
        !item.shared &&
        item.title !== 'Gemini 4 Argon' &&
        item.title !== 'Gemini 4 Carbon' &&
        item.percentage !== null
    );

    if (compact) {
      const compactRows: {
        key: 'gemini' | 'other' | 'argon' | 'carbon';
        label: string;
        primary: ReturnType<typeof extractPoolWindow>;
        secondary?: ReturnType<typeof extractPoolWindow>;
        secondaryTag?: string;
      }[] = [
        {
          key: 'gemini',
          label: 'Gemini',
          primary: poolWindow === '5h' ? gemini5h : geminiWeek,
          secondary: poolWindow === '5h' ? geminiWeek : gemini5h,
          secondaryTag: poolWindow === '5h' ? (zh ? '周' : 'W') : '5H',
        },
        {
          key: 'other',
          label: 'Claude / GPT',
          primary: poolWindow === '5h' ? other5h : otherWeek,
          secondary: poolWindow === '5h' ? otherWeek : other5h,
          secondaryTag: poolWindow === '5h' ? (zh ? '周' : 'W') : '5H',
        },
      ];
      if (argonWeek.remaining !== null) {
        compactRows.push({
          key: 'argon',
          label: zh ? 'Argon 周' : 'Argon (W)',
          primary: argonWeek,
        });
      }
      if (carbon5h.remaining !== null || carbonWeek.remaining !== null) {
        compactRows.push({
          key: 'carbon',
          label: 'Carbon',
          primary: poolWindow === '5h' && carbon5h.remaining !== null ? carbon5h : carbonWeek,
          secondary: poolWindow === '5h' && carbon5h.remaining !== null ? carbonWeek : carbon5h,
          secondaryTag: poolWindow === '5h' ? (zh ? '周' : 'W') : '5H',
        });
      }

      return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {compactRows.map((row) => (
            <div key={row.key} className="group/meter">
              <div className="mb-1 flex items-baseline justify-between gap-1.5">
                <span className="truncate text-[11px] font-medium text-[var(--ink-secondary)]">
                  {row.label}
                </span>
                <div className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
                  <span className="font-semibold text-[var(--ink)]">
                    {row.primary.remaining === null ? '--' : `${Math.round(row.primary.remaining)}%`}
                  </span>
                  {row.secondary && row.secondary.remaining !== null && row.secondaryTag && (
                    <span
                      title={
                        row.secondary.resetTime
                          ? `${row.secondaryTag} · ${formatShortCountdown(row.secondary.resetTime)}`
                          : row.secondaryTag
                      }
                      className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--ink-secondary)]"
                    >
                      {row.secondaryTag} {Math.round(row.secondary.remaining)}%
                    </span>
                  )}
                </div>
              </div>
              <MeterBar value={row.primary.remaining} />
            </div>
          ))}
        </div>
      );
    }

    const corePools: {
      key: 'gemini' | 'other';
      label: string;
      win5h: ReturnType<typeof extractPoolWindow>;
      winWeek: ReturnType<typeof extractPoolWindow>;
    }[] = [
      { key: 'gemini', label: 'Gemini', win5h: gemini5h, winWeek: geminiWeek },
      { key: 'other', label: 'Claude / GPT', win5h: other5h, winWeek: otherWeek },
    ];

    const hasDedicated =
      argonWeek.remaining !== null ||
      carbon5h.remaining !== null ||
      carbonWeek.remaining !== null ||
      extraWeekly.length > 0;

    return (
      <div className="rounded-[20px] bg-[var(--surface-soft)] p-3.5 space-y-3">
        {corePools.map((pool) => {
          const valInfo = valuationDisplayForPool(acc.id, pool.key, poolWindow);
          return (
            <div key={pool.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-[var(--ink)]">
                  {pool.label}
                </span>
                {valInfo && (
                  <span
                    title={valInfo.title}
                    className="truncate text-[10px] tabular-nums text-[var(--ink-muted)]"
                  >
                    {valInfo.line}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* 5H 窗口 */}
                <div className="group/meter min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-1 text-[10px] tabular-nums">
                    <span
                      className={
                        poolWindow === '5h'
                          ? 'font-semibold text-[var(--ink)]'
                          : 'font-medium text-[var(--ink-muted)]'
                      }
                    >
                      5H
                    </span>
                    <div className="flex items-baseline gap-1 min-w-0">
                      {pool.win5h.resetTime && (
                        <span className="truncate text-[9px] text-[var(--ink-muted)]">
                          {formatShortCountdown(pool.win5h.resetTime)}
                        </span>
                      )}
                      <span
                        className={
                          poolWindow === '5h'
                            ? 'text-[11px] font-semibold text-[var(--ink)]'
                            : 'text-[11px] font-medium text-[var(--ink-secondary)]'
                        }
                      >
                        {pool.win5h.remaining === null ? '--' : `${Math.round(pool.win5h.remaining)}%`}
                      </span>
                    </div>
                  </div>
                  <MeterBar value={pool.win5h.remaining} />
                </div>

                {/* 周额度窗口 */}
                <div className="group/meter min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-1 text-[10px] tabular-nums">
                    <span
                      className={
                        poolWindow === 'weekly'
                          ? 'font-semibold text-[var(--ink)]'
                          : 'font-medium text-[var(--ink-muted)]'
                      }
                    >
                      {zh ? '周额度' : 'Weekly'}
                    </span>
                    <div className="flex items-baseline gap-1 min-w-0">
                      {pool.winWeek.resetTime && (
                        <span className="truncate text-[9px] text-[var(--ink-muted)]">
                          {formatShortCountdown(pool.winWeek.resetTime)}
                        </span>
                      )}
                      <span
                        className={
                          poolWindow === 'weekly'
                            ? 'text-[11px] font-semibold text-[var(--ink)]'
                            : 'text-[11px] font-medium text-[var(--ink-secondary)]'
                        }
                      >
                        {pool.winWeek.remaining === null ? '--' : `${Math.round(pool.winWeek.remaining)}%`}
                      </span>
                    </div>
                  </div>
                  <MeterBar value={pool.winWeek.remaining} />
                </div>
              </div>
            </div>
          );
        })}

        {hasDedicated && (
          <div className="border-t border-[var(--border-hairline)] pt-2.5 space-y-2">
            {argonWeek.remaining !== null && (
              <div className="group/meter">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px] tabular-nums">
                  <span className="truncate font-medium text-[var(--ink-secondary)]">
                    {zh ? 'G4 Argon · 周额度' : 'G4 Argon · Weekly'}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    {argonWeek.resetTime && (
                      <span className="text-[9px] text-[var(--ink-muted)]">
                        {formatShortCountdown(argonWeek.resetTime)}
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-[var(--ink)]">
                      {Math.round(argonWeek.remaining)}%
                    </span>
                  </div>
                </div>
                <MeterBar value={argonWeek.remaining} />
              </div>
            )}

            {(carbon5h.remaining !== null || carbonWeek.remaining !== null) && (
              <div className="group/meter">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px] tabular-nums">
                  <span className="truncate font-medium text-[var(--ink-secondary)]">
                    G4 Carbon
                  </span>
                  <div className="flex items-baseline gap-2">
                    {carbon5h.remaining !== null && (
                      <span className="text-[10px] text-[var(--ink-secondary)]">
                        5H <strong className="text-[var(--ink)]">{Math.round(carbon5h.remaining)}%</strong>
                      </span>
                    )}
                    {carbonWeek.remaining !== null && (
                      <span className="text-[10px] text-[var(--ink-secondary)]">
                        {zh ? '周' : 'W'}{' '}
                        <strong className="text-[var(--ink)]">{Math.round(carbonWeek.remaining)}%</strong>
                        {carbonWeek.resetTime ? ` · ${formatShortCountdown(carbonWeek.resetTime)}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <MeterBar
                  value={
                    poolWindow === 'weekly' && carbonWeek.remaining !== null
                      ? carbonWeek.remaining
                      : carbon5h.remaining ?? carbonWeek.remaining
                  }
                />
              </div>
            )}

            {extraWeekly.map((item) => (
              <div key={item.id} className="group/meter">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px] tabular-nums">
                  <span className="truncate font-medium text-[var(--ink-secondary)]">
                    {item.title} · {zh ? '周额度' : 'Weekly'}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    {item.resetTime && (
                      <span className="text-[9px] text-[var(--ink-muted)]">
                        {formatShortCountdown(item.resetTime)}
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-[var(--ink)]">
                      {item.percentage === null ? '--' : `${Math.round(item.percentage)}%`}
                    </span>
                  </div>
                </div>
                <MeterBar value={item.percentage} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderStatusBadges = (acc: Account) => {
    const tier = getAccountTier(acc);
    const expiring = expiringMap.get(acc.id);
    const activeTags = activeLabelsForAccount(acc.id);
    const isBlocked = Boolean(acc.validation_blocked || acc.disabled || acc.quota?.is_forbidden);

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <AccountTierBadge tier={tier} subscription={acc.quota?.subscription_tier} />
        <span className="inline-flex items-center rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--ink-secondary)]">
          P{acc.priority ?? 50}
        </span>
        {expiring && (
          <span
            title={`${expiring.label} ${Math.round(expiring.remaining)}%`}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--amber-ink)]"
          >
            <ClockCountdown size={11} weight="bold" />
            {zh ? '临期' : 'Expiring'} {formatShortCountdown(expiring.hoursLeft)}
          </span>
        )}
        {isBlocked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--rose-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--rose-ink)]">
            <WarningCircle size={11} weight="fill" />
            {acc.quota?.is_forbidden
              ? '403'
              : acc.validation_blocked
                ? zh ? '待验证' : 'Blocked'
                : zh ? '已禁用' : 'Disabled'}
          </span>
        )}
        {activeTags.map((tag) => (
          <span
            key={tag.key}
            title={tag.hint}
            className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-[10px] font-medium ${
              tag.live ? 'text-[var(--ink)]' : 'text-[var(--ink-secondary)]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                tag.live ? 'bg-[var(--emerald)]' : 'bg-[var(--ink-muted)]'
              }`}
            />
            {tag.label}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Compact Header & Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ExpandableSearchPill
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={zh ? '搜索邮箱、备注或 Project ID...' : 'Search email, label, project...'}
            suggestions={[
              { label: 'Ultra', query: 'ultra', hint: `${tierCounts.ultra}` },
              { label: 'Pro', query: 'pro', hint: `${tierCounts.pro}` },
              { label: 'Free', query: 'free', hint: `${tierCounts.free}` },
              { label: zh ? '主力' : 'Primary', query: zh ? '主力' : 'primary' },
            ]}
          />

          <SpringSegmentedControl
            size="sm"
            variant="shell"
            ariaLabel={zh ? '订阅筛选' : 'Tier Filter'}
            value={tierFilter}
            onChange={setTierFilter}
            options={[
              { value: 'all', label: zh ? '全部' : 'All', badge: accounts.length },
              { value: 'ultra', label: 'Ultra' },
              { value: 'pro', label: 'Pro' },
              { value: 'free', label: 'Free' },
              ...(tierCounts.unknown > 0 ? [{ value: 'unknown' as const, label: zh ? '未知' : 'Unknown' }] : []),
            ]}
          />

          <SpringSegmentedControl
            size="sm"
            variant="shell"
            ariaLabel={zh ? '配额窗口' : 'Quota Window'}
            value={poolWindow}
            onChange={setPoolWindow}
            options={[
              { value: '5h', label: '5H' },
              { value: 'weekly', label: zh ? '每周' : 'Weekly' },
            ]}
          />
        </div>

        {/* Right Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <DropdownSelector<SwitchTarget>
            value={switchTarget}
            onChange={setSwitchTarget}
            ariaLabel={zh ? '切换目标客户端' : 'Target Client'}
            prefixLabel={zh ? '目标' : 'Target'}
            icon={<Swap size={14} weight="bold" />}
            options={[
              { value: 'classic', label: 'App + CLI' },
              { value: 'ide', label: 'IDE' },
              { value: 'agy', label: 'CLI (agy)' },
              { value: 'vscode', label: 'VS Code' },
              { value: 'all', label: zh ? '全部客户端' : 'All Clients' },
            ]}
          />

          <SpringSegmentedControl
            size="sm"
            variant="shell"
            ariaLabel={zh ? '视图切换' : 'View Mode'}
            value={viewMode}
            onChange={setViewMode}
            options={[
              {
                value: 'cards',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <SquaresFour size={13} weight="bold" />
                    {zh ? '卡片' : 'Cards'}
                  </span>
                ),
              },
              {
                value: 'list',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <ListIcon size={13} weight="bold" />
                    {zh ? '列表' : 'List'}
                  </span>
                ),
              },
            ]}
          />

          <MorphActionButton
            variant="secondary"
            size="sm"
            idleLabel={zh ? '刷新' : 'Refresh'}
            loadingLabel={zh ? '刷新中' : 'Refreshing'}
            successLabel={zh ? '已完成' : 'Done'}
            icon={<ArrowsClockwise size={13} weight="bold" />}
            onClick={handleRefreshAll}
            className="!bg-[var(--bg-card)] border !border-[var(--border-hairline)] shadow-[var(--shadow-shell)] hover:!bg-[var(--surface)]"
          />

          <MorphActionButton
            variant="secondary"
            size="sm"
            idleLabel={zh ? '预热' : 'Warmup'}
            loadingLabel={zh ? '预热中' : 'Warming'}
            successLabel={zh ? '已预热' : 'Warmed'}
            icon={<Fire size={13} weight="bold" />}
            onClick={handleWarmupAll}
            className="!bg-[var(--bg-card)] border !border-[var(--border-hairline)] shadow-[var(--shadow-shell)] hover:!bg-[var(--surface)]"
          />

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-card)] px-4 text-xs font-semibold text-[var(--ink)] shadow-[var(--shadow-shell)] hover:bg-[var(--surface)]"
          >
            <Plus size={14} weight="bold" />
            <span>{zh ? '添加账号' : 'Add'}</span>
          </button>
        </div>
      </div>

      {/* Floating Bottom Batch Capsule */}
      {selectedIds.size > 0 && (
        <div
          style={{ animation: 'mk-enter 280ms var(--sp-snap) backwards' }}
          className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] p-1.5 pl-2.5 shadow-[var(--shadow-popover)] backdrop-blur-md"
        >
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-3 text-xs font-semibold tabular-nums text-[var(--primary-ink)]">
            {zh ? `已选 ${selectedIds.size}` : `${selectedIds.size} selected`}
          </span>

          <button
            type="button"
            onClick={toggleSelectAllFiltered}
            className="tactile-press rounded-full px-2.5 py-1 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          >
            {filteredAccounts.every((a) => selectedIds.has(a.id))
              ? zh ? '取消全选' : 'Deselect'
              : zh ? '全选' : 'Select All'}
          </button>

          <button
            type="button"
            onClick={() => void handleExport([...selectedIds])}
            className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)]"
          >
            <Export size={13} weight="bold" />
            <span>{zh ? '导出' : 'Export'}</span>
          </button>

          <MorphActionButton
            variant="secondary"
            size="sm"
            idleLabel={zh ? '预热' : 'Warmup'}
            loadingLabel={zh ? '预热中' : 'Warming'}
            successLabel={zh ? '完成' : 'Done'}
            icon={<Fire size={13} weight="bold" />}
            onClick={handleBatchWarmup}
          />

          <HoldToConfirmButton
            onConfirm={handleBatchDelete}
            label={zh ? '按住删除' : 'Hold to Delete'}
            holdingLabel={zh ? '松手取消...' : 'Hold...'}
          />

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            aria-label={zh ? '清空选择' : 'Clear selection'}
            className="tactile-press flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      )}

      {/* 首次读取、读取失败与真实空列表分别呈现，刷新期间保留已有账号。 */}
      {!hasLoadedAccounts && accounts.length === 0 ? (
        error ? (
          <div role="alert" className="rounded-[28px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-8 text-center">
            <p className="text-sm font-semibold text-[var(--ink)]">{zh ? '账号列表读取失败' : 'Could not load accounts'}</p>
            <p className="my-3 break-words text-xs text-[var(--ink-secondary)]">{error}</p>
            <button type="button" onClick={() => void fetchAccounts()} className="tactile-press rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-4 py-2 text-xs font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)]">{zh ? '重新加载' : 'Try again'}</button>
          </div>
        ) : <AccountsSkeleton viewMode={viewMode} zh={zh} />
      ) : filteredAccounts.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[var(--border-strong)] bg-[var(--bg-card)] px-6 py-14 text-center">
          <p className="text-sm font-medium text-[var(--ink)]">
            {loading
              ? zh ? '正在加载账号列表...' : 'Loading accounts...'
              : accounts.length === 0
                ? zh ? '还没有添加任何 Antigravity 账号' : 'No accounts yet'
                : zh ? '没有符合筛选条件的账号' : 'No matching accounts'}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {accounts.length === 0
              ? zh ? '支持 OAuth 登录、Refresh Token 批量导入或从本地应用读取。' : 'Sign in with OAuth, import refresh tokens, or import from local client.'
              : zh ? '尝试清除搜索关键词或切换订阅筛选。' : 'Try clearing search or changing filters.'}
          </p>
          {accounts.length === 0 && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="tactile-press mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus size={14} weight="bold" />
              <span>{zh ? '立即添加账号' : 'Add Account'}</span>
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        /* Card Grid View */
        <div key={`${viewMode}-${poolWindow}`} className="mk-capsule-switch">
        <WaveRevealContainer waveKey={refreshWaveKey} className="rounded-[28px]">
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredAccounts.map((acc, index) => {
            const isSelected = selectedIds.has(acc.id);
            const activeTags = activeLabelsForAccount(acc.id);
            const isActive = isAccountActiveForTarget(acc.id);
            const isLive = activeTags.some((t) => t.live);
            const isExpanded = expandedId === acc.id;

            return (
              <div
                key={acc.id}
                data-account-id={acc.id}
                style={{ '--stagger-index': index } as React.CSSProperties}
                className={`mk-stagger elevated-card elevated-card-hover flex flex-col justify-between rounded-[28px] p-5 ${
                  isActive
                    ? 'border-[var(--border-strong)]'
                    : isSelected
                      ? 'border-[var(--border-strong)] bg-[var(--bg-card-hover)]'
                      : 'hover:border-[var(--border-strong)]'
                }`}
              >
                <div>
                  {/* Card Top Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <SpringCheckbox
                        checked={isSelected}
                        onChange={() => toggleSelect(acc.id)}
                        ariaLabel={`Select ${acc.email}`}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="truncate text-sm font-semibold text-[var(--ink)]">
                            {acc.custom_label || acc.name || acc.email}
                          </h3>
                          {isLive && (
                            <CheckCircle size={15} weight="fill" className="shrink-0 text-[var(--emerald)]" />
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--ink-secondary)]">
                          <CopyPillButton
                            text={acc.email}
                            displayText={acc.email}
                            copiedLabel={zh ? '邮箱已复制' : 'Copied'}
                            mono={false}
                            className="border-transparent bg-transparent px-1.5 py-0.5 text-[11px]"
                            onCopied={() => showToast(zh ? '邮箱已复制' : 'Email copied', 'info')}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {renderSwitchButton(acc, isActive)}
                      {renderQuickMenu(acc)}
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="mt-2.5">{renderStatusBadges(acc)}</div>

                  {/* Appeal / Validation Blocked Banner */}
                  {acc.validation_url && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[18px] bg-[var(--rose-soft)] px-3.5 py-2 text-[11px] text-[var(--rose-ink)]">
                      <span className="truncate">
                        {acc.validation_blocked_reason || (zh ? '账号需要验证解除限制' : 'Verification required')}
                      </span>
                      <button
                        type="button"
                        onClick={() => void openExternalUrl(acc.validation_url!)}
                        className="inline-flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline"
                      >
                        <span>{zh ? '去验证' : 'Verify'}</span>
                        <ArrowSquareOut size={12} weight="bold" />
                      </button>
                    </div>
                  )}

                  {/* Quota Meters */}
                  <div className="mt-3.5">{renderPoolMeters(acc)}</div>
                </div>

                {/* Expand Toggle + Accordion Drawer */}
                <div className="mt-3">
                  <div className="flex items-center justify-between px-0.5 text-[11px] text-[var(--ink-muted)]">
                    {acc.token.project_id ? (
                      <CopyPillButton
                        text={acc.token.project_id}
                        displayText={acc.token.project_id}
                        copiedLabel={zh ? '已复制' : 'Copied'}
                        className="max-w-[175px] border-transparent bg-[var(--surface-soft)]"
                        onCopied={() => showToast(zh ? 'Project ID 已复制' : 'Project ID copied', 'info')}
                      />
                    ) : (
                      <span className="truncate px-1 font-mono text-[10px]">{zh ? '无 Project ID' : 'No Project ID'}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : acc.id)}
                      className="tactile-press inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                    >
                      <span>{isExpanded ? (zh ? '收起' : 'Hide') : (zh ? '详情' : 'Details')}</span>
                      <CaretDown
                        size={12}
                        weight="bold"
                        className={`transition-transform duration-200 ease-out ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>

                  <SpringAccordion open={isExpanded}>
                    <AccountDetailsDrawer
                      account={acc}
                      poolWindow={poolWindow}
                      zh={zh}
                      compact
                      onRefresh={handleRefreshOne}
                      onWarmup={handleWarmupOne}
                      onDelete={handleDeleteOne}
                      onOpenFingerprint={setFingerprintAccount}
                      onExportSingle={(target) => handleExport([target.id])}
                      onSaveLabel={updateAccountLabel}
                      onSavePriority={updateAccountPriority}
                      onSaveProjectId={updateAccountProjectId}
                      onAutoFetchProject={autoFetchAccountProjectId}
                    />
                  </SpringAccordion>
                </div>
              </div>
            );
          })}
        </div>
        </WaveRevealContainer>
        </div>
      ) : (
        /* Sortable List View */
        <div key={`${viewMode}-${poolWindow}`} className="mk-capsule-switch">
        <WaveRevealContainer waveKey={refreshWaveKey} className="rounded-[24px]">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
          <SortableContext items={filteredAccounts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {isFiltered && (
                <p className="text-[11px] text-[var(--ink-muted)]">
                  {zh ? '当前处于筛选状态，清除筛选条件后可拖拽调整账号顺序。' : 'Clear search & tier filters to drag-reorder accounts.'}
                </p>
              )}
              {filteredAccounts.map((acc) => {
                const isSelected = selectedIds.has(acc.id);
                const isActive = isAccountActiveForTarget(acc.id);
                const isExpanded = expandedId === acc.id;

                return (
                  <SortableRowWrapper key={acc.id} id={acc.id} disabled={isFiltered}>
                    {({ attributes, listeners, isDragging }) => (
                      <div
                        data-account-id={acc.id}
                        className={`elevated-card elevated-card-hover rounded-[24px] px-4 py-3.5 ${
                          isDragging
                            ? 'border-[var(--border-strong)] shadow-[var(--shadow-popover)]'
                            : isActive
                              ? 'border-[var(--border-strong)]'
                              : ''
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          {/* Left: Drag Handle + Checkbox + Email + Badges */}
                          <div className="flex min-w-0 items-center gap-2.5 lg:w-[36%]">
                            <button
                              type="button"
                              {...attributes}
                              {...listeners}
                              disabled={isFiltered}
                              title={isFiltered ? (zh ? '清除筛选后可排序' : 'Clear filters to reorder') : (zh ? '拖拽排序' : 'Drag to reorder')}
                              className="shrink-0 cursor-grab rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-30 active:cursor-grabbing"
                            >
                              <DotsSixVertical size={16} weight="bold" />
                            </button>

                            <SpringCheckbox
                              checked={isSelected}
                              onChange={() => toggleSelect(acc.id)}
                              ariaLabel={`Select ${acc.email}`}
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-[var(--ink)]">
                                  {acc.custom_label || acc.name || acc.email}
                                </span>
                                <span className="truncate text-xs text-[var(--ink-muted)]">{acc.email}</span>
                              </div>
                              <div className="mt-1">{renderStatusBadges(acc)}</div>
                            </div>
                          </div>

                          {/* Middle: Compact Quota Bars */}
                          <div className="flex-1">{renderPoolMeters(acc, true)}</div>

                          {/* Right: Quick Actions */}
                          <div className="flex shrink-0 items-center justify-end gap-2">
                            {acc.validation_url && (
                              <button
                                type="button"
                                onClick={() => void openExternalUrl(acc.validation_url!)}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--rose-soft)] px-3 text-[11px] font-semibold text-[var(--rose-ink)]"
                              >
                                <span>{zh ? '申诉' : 'Appeal'}</span>
                                <ArrowSquareOut size={12} />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : acc.id)}
                              className="tactile-press inline-flex h-8 items-center gap-1 rounded-full border border-[var(--border-hairline)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                            >
                              <span>{zh ? '详情' : 'Details'}</span>
                              <CaretDown
                                size={12}
                                weight="bold"
                                className={`transition-transform duration-200 ease-out ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>

                            {renderSwitchButton(acc, isActive)}
                            {renderQuickMenu(acc)}
                          </div>
                        </div>

                        <SpringAccordion open={isExpanded}>
                          <AccountDetailsDrawer
                            account={acc}
                            poolWindow={poolWindow}
                            zh={zh}
                            onRefresh={handleRefreshOne}
                            onWarmup={handleWarmupOne}
                            onDelete={handleDeleteOne}
                            onOpenFingerprint={setFingerprintAccount}
                            onExportSingle={(target) => handleExport([target.id])}
                            onSaveLabel={updateAccountLabel}
                            onSavePriority={updateAccountPriority}
                            onSaveProjectId={updateAccountProjectId}
                            onAutoFetchProject={autoFetchAccountProjectId}
                          />
                        </SpringAccordion>
                      </div>
                    )}
                  </SortableRowWrapper>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        </WaveRevealContainer>
        </div>
      )}

      {/* Dialogs */}
      <AddAccountDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <DeviceFingerprintModal
        account={fingerprintAccount}
        onClose={() => setFingerprintAccount(null)}
      />
    </div>
  );
}
