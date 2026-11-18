import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowCounterClockwise,
  CheckCircle,
  Fingerprint,
  Sparkle,
  Trash,
  X,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Account, DeviceProfile, DeviceProfiles } from '../../types/account';
import * as accountService from '../../services/accountService';
import { CopyPillButton } from '../motion/CopyPillButton';
import { showToast } from '../motion/SpringToast';

interface DeviceFingerprintModalProps {
  account: Account | null;
  onClose: () => void;
}

export function DeviceFingerprintModal({ account, onClose }: DeviceFingerprintModalProps) {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const [renderedAccount, setRenderedAccount] = useState<Account | null>(account);
  const [closing, setClosing] = useState(false);
  const [data, setData] = useState<DeviceProfiles | null>(null);
  const [preview, setPreview] = useState<DeviceProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const load = async (target: Account) => {
    try {
      const res = await accountService.getDeviceProfiles(target.id);
      setData(res);
    } catch (e) {
      showToast(String(e), 'error');
    }
  };

  useEffect(() => {
    if (account) {
      setRenderedAccount(account);
      setClosing(false);
      setPreview(null);
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
      void load(account);
      return () => {
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      };
    }
    if (!renderedAccount) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setRenderedAccount(null);
      setData(null);
      setPreview(null);
      setClosing(false);
    }, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(() => {
    if (!account) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [account, onClose]);

  if (!renderedAccount) return null;

  const targetAccount = account ?? renderedAccount;

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const p = await accountService.previewGenerateProfile();
      setPreview(p);
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleBindPreview = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await accountService.bindDeviceProfileWithProfile(targetAccount.id, preview);
      setPreview(null);
      await load(targetAccount);
      showToast(zh ? '已绑定新设备指纹' : 'Bound generated device profile', 'success');
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCaptureCurrent = async () => {
    setBusy(true);
    try {
      await accountService.bindDeviceProfile(targetAccount.id, 'capture');
      await load(targetAccount);
      showToast(zh ? '已采集并绑定当前指纹' : 'Captured & bound current profile', 'success');
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    setBusy(true);
    try {
      await accountService.applyDeviceProfile(targetAccount.id);
      await load(targetAccount);
      showToast(zh ? '指纹已写入本地客户端' : 'Applied profile to storage.json', 'success');
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    setBusy(true);
    try {
      await accountService.restoreDeviceVersion(targetAccount.id, versionId);
      await load(targetAccount);
      showToast(zh ? '已切换指纹版本' : 'Restored fingerprint version', 'success');
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    setBusy(true);
    try {
      await accountService.deleteDeviceVersion(targetAccount.id, versionId);
      await load(targetAccount);
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const activeProfile = preview || data?.bound_profile;

  return createPortal(
    <div
      data-state={closing ? 'closing' : 'open'}
      className="mk-backdrop fixed inset-0 z-[9990] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={zh ? '设备指纹' : 'Device Fingerprint'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        className="mk-dialog flex max-h-[85dvh] w-full max-w-lg flex-col rounded-[32px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-popover)]"
      >
        {/* 21-分享面板风格：胶囊标题栏 + 圆形关闭按钮 */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-[var(--surface)] px-4">
            <Fingerprint size={16} weight="bold" className="shrink-0 text-[var(--ink-secondary)]" />
            <span className="shrink-0 text-xs font-semibold text-[var(--ink)]">
              {zh ? '设备指纹' : 'Device ID'}
            </span>
            <span className="truncate text-xs text-[var(--ink-muted)]">· {targetAccount.email}</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={zh ? '关闭' : 'Close'}
            className="tactile-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-0.5">
          {/* 当前指纹（无嵌套线框，单层暖灰内凹块） */}
          <div className="space-y-2 rounded-[24px] bg-[var(--surface-soft)] p-3">
            <div className="flex items-center justify-between px-1.5">
              <span className="text-xs font-semibold text-[var(--ink)]">
                {preview
                  ? zh
                    ? '新指纹预览'
                    : 'Generated Preview'
                  : zh
                    ? '当前绑定指纹'
                    : 'Bound Fingerprint'}
              </span>
              {activeProfile && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                    preview
                      ? 'bg-[var(--amber-soft)] text-[var(--amber-ink)]'
                      : 'bg-[var(--emerald-soft)] text-[var(--emerald-ink)]'
                  }`}
                >
                  <CheckCircle size={11} weight="fill" />
                  {preview ? (zh ? '待保存' : 'Unsaved') : zh ? '已绑定' : 'Bound'}
                </span>
              )}
            </div>

            {activeProfile ? (
              <div className="space-y-1.5 font-mono text-[11px]">
                {(
                  [
                    ['machineId', activeProfile.machine_id],
                    ['devDeviceId', activeProfile.dev_device_id],
                    ['macMachineId', activeProfile.mac_machine_id],
                    ['sqmId', activeProfile.sqm_id],
                  ] as const
                ).map(([label, val]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-2 rounded-[16px] bg-[var(--bg-card)] px-3.5 py-2"
                  >
                    <span className="shrink-0 text-[var(--ink-secondary)]">{label}</span>
                    {val ? (
                      <CopyPillButton
                        text={val}
                        copiedLabel={zh ? '已复制' : 'Copied'}
                        className="max-w-[245px] border-transparent bg-[var(--surface-soft)]"
                        onCopied={() => showToast(zh ? `${label} 已复制` : `${label} copied`, 'info')}
                      />
                    ) : (
                      <span className="text-[var(--ink-muted)]">{zh ? '未提供' : 'N/A'}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-1.5 py-2 text-xs text-[var(--ink-muted)]">
                {zh ? '尚未绑定独立指纹，切换账号时将自动生成。' : 'No fingerprint bound yet; auto-generated on switch.'}
              </p>
            )}
          </div>

          {/* 操作胶囊行 */}
          <div className="flex flex-wrap gap-2">
            {preview ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleBindPreview()}
                  className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-4 text-xs font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)]"
                >
                  <CheckCircle size={14} weight="bold" />
                  <span>{zh ? '确认绑定' : 'Confirm Bind'}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                  className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--surface)] px-4 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                >
                  {zh ? '取消' : 'Cancel'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleGenerate()}
                  className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-4 text-xs font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)]"
                >
                  <Sparkle size={14} weight="bold" />
                  <span>{zh ? '生成随机指纹' : 'Generate New'}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCaptureCurrent()}
                  className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                >
                  {zh ? '采集当前' : 'Capture Current'}
                </button>
                {data?.bound_profile && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleApply()}
                    className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                  >
                    {zh ? '写入客户端' : 'Apply Now'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* 历史快照 */}
          {(data?.history?.length || data?.baseline) && (
            <div className="space-y-2">
              <div className="px-1 text-xs font-semibold text-[var(--ink-secondary)]">
                {zh ? '历史记录' : 'History & Baseline'}
              </div>
              <div className="space-y-1.5 rounded-[24px] bg-[var(--surface-soft)] p-2.5">
                {data?.baseline && (
                  <div className="flex items-center justify-between gap-2 rounded-[18px] bg-[var(--bg-card)] px-3.5 py-2.5 text-xs">
                    <div className="min-w-0">
                      <span className="font-medium text-[var(--ink)]">
                        {zh ? '原始基准' : 'Baseline'}
                      </span>
                      <p className="truncate font-mono text-[10px] text-[var(--ink-muted)]">
                        {data.baseline.dev_device_id}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRestore('baseline')}
                      className="tactile-press inline-flex h-7 items-center gap-1 rounded-full bg-[var(--surface)] px-3 text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                    >
                      <ArrowCounterClockwise size={12} weight="bold" />
                      <span>{zh ? '恢复' : 'Restore'}</span>
                    </button>
                  </div>
                )}

                {data?.history?.map((ver) => (
                  <div
                    key={ver.id}
                    className="flex items-center justify-between gap-2 rounded-[18px] bg-[var(--bg-card)] px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-[var(--ink)]">{ver.label}</span>
                        {ver.is_current && (
                          <span className="rounded-full bg-[var(--emerald-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--emerald-ink)]">
                            {zh ? '当前' : 'Active'}
                          </span>
                        )}
                      </div>
                      <p className="truncate font-mono text-[10px] text-[var(--ink-muted)]">
                        {ver.profile.dev_device_id}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!ver.is_current && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRestore(ver.id)}
                            className="tactile-press inline-flex h-7 items-center gap-1 rounded-full bg-[var(--surface)] px-3 text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                          >
                            {zh ? '启用' : 'Use'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDeleteVersion(ver.id)}
                            aria-label="删除历史"
                            className="tactile-press flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--rose-soft)] hover:text-[var(--rose-ink)]"
                          >
                            <Trash size={12} weight="bold" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
