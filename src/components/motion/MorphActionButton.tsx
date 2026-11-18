import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { commitMorph, createMorphTrack, mkSpinnerPhaseDelay, prefersReducedMotion } from './mkSpring';
import { StatusIcon } from './StatusIcon';

export type MorphButtonStatus = 'idle' | 'loading' | 'success' | 'error';

interface MorphActionButtonProps {
  onClick: () => Promise<void> | void;
  idleLabel: string;
  loadingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** 视图重建后仍保留调用方正在执行的状态。 */
  pending?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
}

/** 参考 05：saved 态停留 2000ms 后自动复位 */
const SUCCESS_HOLD_MS = 2000;

/**
 * MorphActionButton
 * 状态过渡参考 MK-ENGINE 的 reconcile()。
 * 1) 同一个按钮元素在 idle → loading → success → idle 间形变，宽度在绘制前 FLIP（变宽 MK.snap、变窄 MK.soft），
 *    被打断时从当前动画宽度继续，不跳变；
 * 2) 旧内容快照 150ms blur(7px)+scale(.9) 退场，新内容延迟 60ms、240ms 去模糊浮现（反向回 idle 同样走这一套）；
 * 3) 加载态为 0.8s 匀速细环（与参考 .spinner 一致），加载期间按钮保持原色而非变灰；
 * 4) 绿色完成态 0.28s 后镜面扫光，2s 后自动复位，点击完成态可立即复位；
 * 5) onClick 抛错时轻抖提示；指定 errorLabel 时保留失败重试态，否则回到 idle。
 */
export function MorphActionButton({
  onClick,
  idleLabel,
  loadingLabel,
  successLabel = '完成',
  errorLabel,
  icon,
  disabled = false,
  pending = false,
  variant = 'primary',
  size = 'md',
  className = '',
  title,
}: MorphActionButtonProps) {
  const [status, setStatus] = useState<MorphButtonStatus>('idle');

  const btnRef = useRef<HTMLButtonElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef(createMorphTrack());
  const statusRef = useRef<MorphButtonStatus>('idle');
  const runRef = useRef(0);
  const mountedRef = useRef(true);
  const spinnerDelayRef = useRef('0ms');
  const displayedStatus = pending ? 'loading' : status;

  const go = (next: MorphButtonStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const currentLabel =
    displayedStatus === 'loading' ? loadingLabel ?? idleLabel : displayedStatus === 'success' ? successLabel : displayedStatus === 'error' ? errorLabel : idleLabel;

  // 每次提交都在绘制前比对：状态或文案变化即触发宽度 FLIP + 内容交叉淡化
  useLayoutEffect(() => {
    commitMorph(trackRef.current, {
      box: btnRef.current,
      inner: innerRef.current,
      ghost: ghostRef.current,
      key: `${displayedStatus}\u0000${currentLabel}`,
    });
  });

  // 完成态自动回落 idle（反向形变由 commitMorph 统一处理）
  useEffect(() => {
    if (status !== 'success') return;
    const t = window.setTimeout(() => go('idle'), SUCCESS_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  /** 失败反馈：水平轻抖，减弱动效时跳过 */
  const shake = () => {
    const btn = btnRef.current;
    if (!btn || prefersReducedMotion()) return;
    btn.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-4px)', offset: 0.18 },
        { transform: 'translateX(4px)', offset: 0.38 },
        { transform: 'translateX(-2.5px)', offset: 0.58 },
        { transform: 'translateX(1.5px)', offset: 0.78 },
        { transform: 'translateX(0)' },
      ],
      { duration: 380, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' }
    );
  };

  const handleClick = async () => {
    if (disabled || pending) return;
    // 参考 05：点击绿色完成态立即复位
    if (statusRef.current === 'success') {
      go('idle');
      return;
    }
    if (statusRef.current === 'loading') return;
    const run = ++runRef.current;
    spinnerDelayRef.current = mkSpinnerPhaseDelay();
    go('loading');
    try {
      await onClick();
      if (!mountedRef.current || run !== runRef.current) return;
      go('success');
    } catch {
      if (!mountedRef.current || run !== runRef.current) return;
      go(errorLabel ? 'error' : 'idle');
      shake();
    }
  };

  const iconSize = size === 'sm' ? 12 : 14;
  const spinnerSize = size === 'sm' ? 11 : 13;

  const renderContent = () => {
    if (displayedStatus === 'loading') {
      return (
        <>
          <span
            aria-hidden="true"
            className="mk-spinner"
            style={{
              width: spinnerSize,
              height: spinnerSize,
              borderWidth: size === 'sm' ? 1.75 : 2,
              animationDelay: spinnerDelayRef.current,
            }}
          />
          {loadingLabel !== '' && <span>{loadingLabel ?? idleLabel}</span>}
        </>
      );
    }
    if (displayedStatus === 'success') {
      return (
        <>
          {errorLabel ? <StatusIcon state="success" size={iconSize + 2} /> : <Check size={iconSize} weight="bold" className="shrink-0" />}
          <span>{successLabel}</span>
        </>
      );
    }
    if (displayedStatus === 'error') {
      return <><StatusIcon state="error" size={iconSize + 2} /><span>{errorLabel}</span></>;
    }
    return (
      <>
        {icon && <span className="flex shrink-0 items-center">{icon}</span>}
        {idleLabel && <span>{idleLabel}</span>}
      </>
    );
  };

  const sizeCls = size === 'sm' ? 'h-8 px-3.5 text-xs gap-1.5' : 'h-9 px-4 text-xs gap-1.5';

  let styleCls = '';
  if (displayedStatus === 'success') {
    styleCls = 'bg-[var(--emerald)] text-white border-transparent mk-shine';
  } else if (displayedStatus === 'error') {
    styleCls = 'bg-[var(--rose-soft)] text-[var(--rose-ink)] border-transparent hover:opacity-85';
  } else if (variant === 'primary') {
    styleCls =
      'bg-[var(--primary-soft)] text-[var(--primary-ink)] border-[var(--primary-border)] shadow-[0_1px_2px_rgba(25,25,20,0.045),inset_0_1px_0_rgba(255,255,255,0.72)] disabled:opacity-40 ' +
      (displayedStatus === 'idle' ? 'hover:bg-[var(--primary-soft-hover)]' : '');
  } else if (variant === 'secondary') {
    styleCls =
      'bg-[var(--surface-soft)] text-[var(--ink-secondary)] border-transparent disabled:opacity-40 ' +
      (displayedStatus === 'idle' ? 'hover:bg-[var(--surface)] hover:text-[var(--ink)]' : '');
  } else {
    styleCls =
      'bg-transparent text-[var(--ink-secondary)] border-transparent disabled:opacity-40 ' +
      (displayedStatus === 'idle' ? 'hover:bg-[var(--surface)] hover:text-[var(--ink)]' : '');
  }

  const loading = displayedStatus === 'loading';

  return (
    <button
      ref={btnRef}
      type="button"
      title={title}
      // 加载中不使用原生 disabled：避免 disabled:opacity-40 让按钮在加载时整体变灰（参考中加载态保持原色）
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading}
      data-status={displayedStatus}
      onClick={() => void handleClick()}
      style={{
        transition:
          'background-color 200ms ease, color 200ms ease, border-color 200ms ease, opacity 200ms ease, transform var(--t-soft) var(--sp-soft)',
      }}
      className={`tactile-press relative inline-flex items-center justify-center rounded-full border font-semibold whitespace-nowrap select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        loading ? 'cursor-progress' : ''
      } ${sizeCls} ${styleCls} ${className}`}
    >
      {/* 幽灵层：React 不管理其子节点，由 commitMorph 写入旧内容快照并淡出 */}
      <span
        ref={ghostRef}
        aria-hidden="true"
        className="mk-ghost-layer pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 whitespace-nowrap"
      />
      <span ref={innerRef} className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap">
        {renderContent()}
      </span>
    </button>
  );
}
