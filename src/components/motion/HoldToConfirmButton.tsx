import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, Check, Trash } from '@phosphor-icons/react';
import { MK, prefersReducedMotion } from './mkSpring';

interface HoldToConfirmButtonProps {
  onConfirm: () => void | Promise<void>;
  label?: string;
  holdingLabel?: string;
  deletedLabel?: string;
  undoLabel?: string;
  holdMs?: number;
  /** 完成长按后留给用户撤销的倒计时窗口（毫秒）。设为 0 则立即执行 onConfirm。 */
  undoMs?: number;
  disabled?: boolean;
  className?: string;
}

type HoldPhase = 'idle' | 'undoable';

/**
 * HoldToConfirmButton
 * 完整复刻 E:\ui动效\09-视频复刻组件库-23件套\components\04-长按删除与撤销-进度填充与倒计时撤销.html：
 * 1) 按住触发水平 clip-path 红色填充进度，松手回弹取消；
 * 2) 满格后闪红回落并形态拆分为「已确认 + 圆形倒计时环撤销」双胶囊；
 * 3) 点击 Undo 即刻中断并弹簧恢复原态，倒计时结束才真正触发 onConfirm。
 */
export function HoldToConfirmButton({
  onConfirm,
  label = '长按移除',
  holdingLabel = '继续按住确认…',
  deletedLabel = '待移除',
  undoLabel = '撤销',
  holdMs = 850,
  undoMs = 2600,
  disabled = false,
  className = '',
}: HoldToConfirmButtonProps) {
  const [phase, setPhase] = useState<HoldPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [undoRatio, setUndoRatio] = useState(0);

  const shellRef = useRef<HTMLDivElement>(null);
  const holdRafRef = useRef(0);
  const undoRafRef = useRef(0);
  const startRef = useRef(0);
  const undoStartRef = useRef(0);
  const holdCancelTimeout = useRef(0);
  const prevWidthRef = useRef<number | null>(null);

  const cleanupTimers = () => {
    if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    if (undoRafRef.current) cancelAnimationFrame(undoRafRef.current);
    if (holdCancelTimeout.current) window.clearTimeout(holdCancelTimeout.current);
    holdRafRef.current = 0;
    undoRafRef.current = 0;
  };

  useEffect(() => cleanupTimers, []);

  // 外壳容器弹簧宽度过渡
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const nextW = el.scrollWidth;
    const prevW = prevWidthRef.current;
    prevWidthRef.current = nextW;
    if (prevW === null || Math.abs(prevW - nextW) < 2 || prefersReducedMotion()) return;
    const spec = nextW > prevW ? MK.snap : MK.soft;
    el.animate([{ width: `${prevW}px` }, { width: `${nextW}px` }], {
      duration: spec.dur,
      easing: spec.ease,
    });
  }, [phase]);

  const stopHold = () => {
    if (!holding) return;
    setHolding(false);
    if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    holdRafRef.current = 0;
    setProgress(0);
  };

  const triggerUndoWindow = () => {
    if (undoMs <= 0) {
      void onConfirm();
      return;
    }
    prevWidthRef.current = shellRef.current?.getBoundingClientRect().width ?? null;
    setPhase('undoable');
    setUndoRatio(0);
    undoStartRef.current = performance.now();

    const tickUndo = (now: number) => {
      const p = Math.min(1, (now - undoStartRef.current) / undoMs);
      setUndoRatio(p);
      if (p >= 1) {
        undoRafRef.current = 0;
        prevWidthRef.current = shellRef.current?.getBoundingClientRect().width ?? null;
        setPhase('idle');
        setUndoRatio(0);
        void onConfirm();
        return;
      }
      undoRafRef.current = requestAnimationFrame(tickUndo);
    };
    undoRafRef.current = requestAnimationFrame(tickUndo);
  };

  const handleUndo = () => {
    cleanupTimers();
    prevWidthRef.current = shellRef.current?.getBoundingClientRect().width ?? null;
    setPhase('idle');
    setUndoRatio(0);
    setProgress(0);
    setHolding(false);
  };

  const beginHold = () => {
    if (disabled || phase !== 'idle' || holding) return;
    setHolding(true);
    startRef.current = performance.now();

    const tick = (now: number) => {
      const ratio = Math.min(1, (now - startRef.current) / holdMs);
      setProgress(ratio * 100);
      if (ratio >= 1) {
        holdRafRef.current = 0;
        setHolding(false);
        setProgress(0);
        triggerUndoWindow();
        return;
      }
      holdRafRef.current = requestAnimationFrame(tick);
    };
    holdRafRef.current = requestAnimationFrame(tick);
  };

  const rightClip = Math.max(0, 100 - progress);

  return (
    <div ref={shellRef} className={`inline-flex items-center gap-1.5 overflow-hidden ${className}`}>
      {phase === 'idle' ? (
        <button
          type="button"
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            beginHold();
          }}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!holding) beginHold();
            }
          }}
          onKeyUp={stopHold}
          className="relative inline-flex h-8 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-[var(--rose-soft)] bg-[var(--rose-soft)] px-3.5 text-xs font-semibold text-[var(--rose-ink)] select-none touch-none transition-transform duration-150 active:scale-[0.96] disabled:opacity-40"
        >
          <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
            <Trash size={13} weight="bold" />
            <span>{holding ? holdingLabel : label}</span>
          </span>
          <span
            aria-hidden="true"
            style={{
              clipPath: `inset(0 ${rightClip}% 0 0)`,
              transition: holding ? 'none' : 'clip-path 240ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-1.5 whitespace-nowrap bg-[var(--rose)] px-3.5 text-white"
          >
            <Trash size={13} weight="bold" />
            <span>{holding ? holdingLabel : label}</span>
          </span>
        </button>
      ) : (
        <>
          <span
            className="mk-deleted-flash inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold whitespace-nowrap select-none"
            style={{ animation: 'mk-enter 280ms var(--sp-snap) both, mk-deleted-flash 500ms ease-out both' }}
          >
            <Check size={13} weight="bold" />
            <span>{deletedLabel}</span>
          </span>
          <button
            type="button"
            onClick={handleUndo}
            style={{ animation: 'mk-enter 320ms 40ms var(--sp-snap) both' }}
            className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] whitespace-nowrap hover:bg-[var(--surface-hover)]"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 -rotate-90" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" className="opacity-25" />
              <circle
                cx="12"
                cy="12"
                r="9"
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={undoRatio * 100}
                strokeLinecap="round"
              />
            </svg>
            <ArrowCounterClockwise size={12} weight="bold" />
            <span>{undoLabel}</span>
          </button>
        </>
      )}
    </div>
  );
}
