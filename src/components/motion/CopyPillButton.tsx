import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Copy, WarningCircle } from '@phosphor-icons/react';
import { copyToClipboard } from '../../utils/clipboard';
import { MK, commitMorph, createMorphTrack, prefersReducedMotion } from './mkSpring';

interface CopyPillButtonProps {
  text: string;
  displayText?: string;
  copiedLabel?: string;
  /** 复制失败（剪贴板不可用）时的提示文案，可选 */
  failedLabel?: string;
  onCopied?: () => void;
  className?: string;
  mono?: boolean;
}

type CopyState = 'idle' | 'copied' | 'failed';

/** 参考 16：反馈态停留 1800ms 后复位 */
const RESET_MS = 1800;

/** 反馈态颜色用内联样式，保证不会被调用方 className（如 bg-transparent）覆盖导致白字隐形 */
const STATE_STYLE: Record<Exclude<CopyState, 'idle'>, CSSProperties> = {
  copied: { backgroundColor: 'var(--emerald)', borderColor: 'var(--emerald)', color: '#ffffff' },
  failed: { backgroundColor: 'var(--rose-soft)', borderColor: 'var(--rose-soft)', color: 'var(--rose-ink)' },
};

/**
 * CopyPillButton
 * 1) 胶囊在绘制前进行 FLIP 宽度过渡，扩张和收缩均使用 MK.snap；
 * 2) 背景/文字 .25s 过渡到绿色，勾号 .35s scale(.6) rotate(-15deg) 旋入，重复复制会重播勾号；
 * 3) 文案以 morphText 方式切换：新文案自下方 9px、blur(5px) 320ms 浮现（无旧文案残影、无闪烁）；
 * 4) 1.8s 后收缩回原态；剪贴板不可用时给出失败反馈而不是静默无响应。
 */
export function CopyPillButton({
  text,
  displayText,
  copiedLabel = '已复制',
  failedLabel = '复制失败',
  onCopied,
  className = '',
  mono = true,
}: CopyPillButtonProps) {
  const [state, setState] = useState<CopyState>('idle');
  const [pulse, setPulse] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef(createMorphTrack());
  const lastLabelRef = useRef<string | null>(null);
  const timerRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const label = state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : displayText ?? text;

  // 绘制前：宽度 FLIP + 文案 morphText
  useLayoutEffect(() => {
    commitMorph(trackRef.current, {
      box: btnRef.current,
      key: `${state}\u0000${label}`,
      pick: () => MK.snap,
    });
    const el = labelRef.current;
    const prev = lastLabelRef.current;
    lastLabelRef.current = label;
    if (!el || prev === null || prev === label || prefersReducedMotion()) return;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      [
        { opacity: 0, filter: 'blur(5px)', transform: 'translateY(9px)' },
        { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0px)' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.2, 0.75, 0.2, 1)' }
    );
  });

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (!mountedRef.current) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (ok) {
      setState('copied');
      setPulse((p) => p + 1);
      onCopied?.();
    } else {
      setState('failed');
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = 0;
      setState('idle');
    }, RESET_MS);
  };

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => void handleCopy()}
      title={`复制 ${text}`}
      style={{
        transition:
          'background-color 250ms ease, color 250ms ease, border-color 250ms ease, transform var(--t-soft) var(--sp-soft)',
        ...(state === 'idle' ? null : STATE_STYLE[state]),
      }}
      className={`tactile-press inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap select-none ${
        state === 'idle'
          ? 'border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
          : ''
      } ${className}`}
    >
      {state === 'copied' ? (
        <Check key={pulse} size={12} weight="bold" className="mk-check-in shrink-0" />
      ) : state === 'failed' ? (
        <WarningCircle size={12} weight="bold" className="mk-check-in shrink-0" />
      ) : (
        <Copy size={12} className="shrink-0 opacity-75" />
      )}
      <span ref={labelRef} className={`min-w-0 truncate ${mono ? 'font-mono' : ''}`}>
        {label}
      </span>
    </button>
  );
}
