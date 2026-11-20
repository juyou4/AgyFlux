import { useEffect, useRef, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cancelAutoSwitch, checkAutoSwitchNow, getAutoSwitchStatus } from '../../services/autoSwitchService';
import type { AutoSwitchConfig, AutoSwitchStatus } from '../../types/autoSwitch';
import { MorphActionButton } from '../motion/MorphActionButton';
import { showToast } from '../motion/SpringToast';

export function AutoSwitchStatusBar({ config }: { config: AutoSwitchConfig }) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const [status, setStatus] = useState<AutoSwitchStatus | null>();
  const revision = useRef(0);

  useEffect(() => {
    let disposed = false;
    let reading = false;
    let timer: number | undefined;
    const read = async () => {
      window.clearTimeout(timer);
      if (disposed || document.hidden || reading) return;
      const ticket = revision.current;
      reading = true;
      try {
        const snapshot = await getAutoSwitchStatus().catch(() => null);
        if (!disposed && !document.hidden && revision.current === ticket) setStatus(snapshot);
      } finally {
        reading = false;
        if (!disposed && !document.hidden) timer = window.setTimeout(read, 5000);
      }
    };
    void read();
    document.addEventListener('visibilitychange', read);
    return () => {
      disposed = true;
      revision.current++;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', read);
    };
  }, [config]);

  const runAction = async (action: () => Promise<AutoSwitchStatus>) => {
    const ticket = ++revision.current;
    try {
      const snapshot = await action();
      if (revision.current === ticket) {
        // 避免操作完成前发出的读取用旧状态覆盖结果。
        revision.current++;
        setStatus(snapshot);
      }
    } catch (error) {
      if (revision.current === ticket) showToast(t('auto_switch.action_failed'), 'error');
      throw error;
    }
  };

  const pendingId = status?.pending_id;
  const reason = status?.reason;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-xs">
      <div role="status" className="flex flex-wrap items-center gap-2">
        {status?.phase === 'monitoring' ? (
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="status-ping-ring absolute inset-0 rounded-full bg-[var(--emerald)]" />
            <span className="relative h-2 w-2 rounded-full bg-[var(--emerald)]" />
          </span>
        ) : (
          <span className={`inline-block h-2 w-2 rounded-full ${
            status?.phase === 'pending' || status?.phase === 'switching' ? 'bg-[var(--amber)] animate-pulse'
              : status?.phase === 'blocked' ? 'bg-[var(--rose)]' : 'bg-[var(--ink-muted)]'
          }`} />
        )}
        <span className="font-semibold text-[var(--ink)]">
          {status
            ? t(`auto_switch.phase.${status.phase}`, { defaultValue: t('auto_switch.status_failed') })
            : t(status === null ? 'auto_switch.status_failed' : 'auto_switch.loading')}
        </span>
        {status && <span className="text-[var(--ink-secondary)]">· {t(`auto_switch.process.${status.process_state}`, { defaultValue: t('auto_switch.process.unknown') })}</span>}
        {reason && !(reason === 'process_unknown' && status?.process_state === 'unknown') && (
          <span className="text-[var(--ink-muted)]">· {t(`auto_switch.reasons.${reason}`, { defaultValue: t('auto_switch.action_failed') })}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {pendingId && (
          <MorphActionButton variant="secondary" size="sm"
            className="!bg-[var(--rose-soft)] !text-[var(--rose-ink)]"
            idleLabel={zh ? '取消待切换' : 'Cancel pending switch'} loadingLabel={zh ? '取消中' : 'Canceling'}
            onClick={() => runAction(async () => {
              await cancelAutoSwitch(pendingId);
              showToast(zh ? '已取消待执行切换' : 'Pending switch canceled', 'info');
              return getAutoSwitchStatus();
            })} />
        )}
        <MorphActionButton variant="secondary" size="sm"
          idleLabel={zh ? '立即检查' : 'Check Now'} loadingLabel={zh ? '检查中' : 'Checking'}
          successLabel={zh ? '已检查' : 'Checked'} errorLabel={zh ? '重试' : 'Retry'}
          icon={<ArrowsClockwise size={13} weight="bold" />} onClick={() => runAction(checkAutoSwitchNow)} />
      </div>
    </div>
  );
}
