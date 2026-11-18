import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { SpringAccordion } from '../motion/SpringAccordion';
import { StatusIcon, type StatusIconState } from '../motion/StatusIcon';

export type OAuthStage = 'idle' | 'preparing' | 'waiting' | 'saving' | 'cancelling' | 'cancelled' | 'success' | 'error';

/** 状态胶囊沿用真实授权阶段，无框暖底色圆润卡片。 */
export function OAuthStatusCard({
  stage,
  detail,
  countdown,
  zh,
  children,
}: {
  stage: OAuthStage;
  detail?: string;
  countdown?: string;
  zh: boolean;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const headerRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();

  const titles: Record<OAuthStage, string> = zh
    ? {
        idle: 'Google 账号授权',
        preparing: '正在准备授权',
        waiting: '等待浏览器登录',
        saving: '正在验证并保存',
        cancelling: '正在取消',
        cancelled: '已取消授权',
        success: '账号已添加',
        error: '授权未完成',
      }
    : {
        idle: 'Google Authorization',
        preparing: 'Preparing authorization',
        waiting: 'Waiting for sign-in',
        saving: 'Verifying and saving',
        cancelling: 'Cancelling',
        cancelled: 'Cancelled',
        success: 'Account added',
        error: 'Authorization incomplete',
      };

  const iconState: StatusIconState =
    stage === 'preparing' || stage === 'saving' || stage === 'cancelling'
      ? 'busy'
      : stage === 'idle'
        ? 'idle'
        : stage;
  const currentStep =
    stage === 'preparing' ? 0 : stage === 'waiting' ? 1 : stage === 'saving' ? 2 : stage === 'success' ? 3 : -1;
  const steps = zh
    ? ['生成授权链接', '浏览器完成登录', '保存账号凭据']
    : ['Prepare login link', 'Sign in via browser', 'Save credentials'];

  useEffect(() => {
    const next = ['waiting', 'saving', 'cancelling', 'error'].includes(stage);
    if (!next && bodyRef.current?.contains(document.activeElement)) headerRef.current?.focus();
    setExpanded(next);
  }, [stage]);

  return (
    <section
      className="mk-oauth-status rounded-[22px] bg-[var(--surface-soft)]"
      data-stage={stage}
    >
      <button
        ref={headerRef}
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={zh ? '授权进度详情' : 'Authorization progress details'}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-14 w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]"
      >
        <span
          className={
            stage === 'success'
              ? 'text-[var(--emerald-ink)]'
              : stage === 'error'
                ? 'text-[var(--rose-ink)]'
                : 'text-[var(--ink)]'
          }
        >
          <StatusIcon state={iconState} size={21} />
        </span>
        <span className="min-w-0 flex-1" role="status" aria-live="polite" aria-atomic="true">
          <span key={stage} className="mk-status-text block text-xs font-semibold text-[var(--ink)]">
            {titles[stage]}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-secondary)]">
            {detail ||
              (stage === 'success'
                ? zh
                  ? '配额将在后台更新'
                  : 'Quota updates in background'
                : stage === 'cancelled'
                  ? zh
                    ? '可随时重新开始'
                    : 'Ready to retry'
                  : stage === 'error'
                    ? zh
                      ? '展开查看原因'
                      : 'Expand for details'
                    : expanded
                      ? zh
                        ? '收起步骤'
                        : 'Hide steps'
                      : zh
                        ? '登录 Google 后自动保存'
                        : 'Saved automatically after sign-in')}
          </span>
        </span>
        {countdown && (
          <span
            aria-label={zh ? '剩余时间' : 'Time remaining'}
            className="rounded-full bg-[var(--bg-card)] px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-secondary)]"
          >
            {countdown}
          </span>
        )}
        <CaretDown
          size={13}
          weight="bold"
          className="mk-status-chevron shrink-0 text-[var(--ink-muted)]"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      <SpringAccordion open={expanded}>
        <div ref={bodyRef} id={bodyId} inert={!expanded} aria-hidden={!expanded} className="space-y-3 px-4 pb-4">
          <ol
            aria-label={zh ? '授权步骤' : 'Authorization steps'}
            className="space-y-1.5 rounded-[16px] bg-[var(--bg-card)] p-3"
          >
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={index === currentStep ? 'step' : undefined}
                className={`flex items-center gap-2 text-[11px] ${
                  index <= currentStep ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-muted)]'
                }`}
              >
                <StatusIcon
                  size={14}
                  state={
                    index < currentStep
                      ? 'success'
                      : index === currentStep
                        ? stage === 'waiting'
                          ? 'waiting'
                          : 'busy'
                        : 'idle'
                  }
                />
                {label}
                {index < currentStep && <span className="sr-only">{zh ? '已完成' : 'Completed'}</span>}
              </li>
            ))}
          </ol>
          {children}
        </div>
      </SpringAccordion>
    </section>
  );
}
