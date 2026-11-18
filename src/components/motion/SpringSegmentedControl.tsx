import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion, stepSpringEdge } from './mkSpring';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  badge?: number | string;
}

interface SpringSegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  variant?: 'recessed' | 'shell';
  fullWidth?: boolean;
  className?: string;
}

/* Calibrated dual-edge spring parameters: subtle stretch without rubber-band bounce */
const LEAD_SPRING = { w: 30, z: 0.85 };
const LAG_SPRING = { w: 22, z: 0.96 };
/* 参考实现的收敛阈值与单帧最大步长 */
const SETTLE_EPS = 0.4;
const MAX_DT = 0.032;

/**
 * SpringSegmentedControl
 * 1) 高亮底块左右两条边各自挂一根阻尼弹簧：运动方向前沿 (w=26, ζ=.7) 领先、后沿 (w=18, ζ=.95) 滞后，
 *    形成“先拉伸再收拢”的弹性滑动；每帧 2 次子步进，dt 上限 32ms，收敛阈值 .4；
 * 2) 选中项字重 500→600：通过“隐形粗体占位”固定每个分段的宽度，字重切换不再引起分段宽度变化，
 *    从而避免容器尺寸抖动、目标位置漂移；
 * 3) 首帧 / 尺寸变化（窗口缩放、字体加载）时：静止状态直接对齐，动画进行中则只更新目标，
 *    不会把正在进行的弹簧动画硬切成瞬移；
 * 4) 支持方向键 / Home / End 漫游焦点，按下 scale(.96) 弹性回弹；尊重 prefers-reduced-motion。
 */
export function SpringSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  variant = 'recessed',
  fullWidth = false,
  className = '',
}: SpringSegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const phys = useRef({ l: 0, r: 0, vl: 0, vr: 0, tl: 0, tr: 0, raf: 0, t: 0, initialized: false });

  const activeIdx = Math.max(0, options.findIndex((o) => o.value === value));
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;

  /** 把当前物理状态写入 DOM（仅 transform + width，单次写入，无读取） */
  const paint = () => {
    const hl = highlightRef.current;
    if (!hl) return;
    const s = phys.current;
    hl.style.transform = `translateX(${s.l}px)`;
    hl.style.width = `${Math.max(8, s.r - s.l)}px`;
  };

  /** 读取选中分段的目标左右边缘 */
  const readTarget = (): boolean => {
    const btn = btnRefs.current[activeIdxRef.current];
    if (!btn) return false;
    const s = phys.current;
    s.tl = btn.offsetLeft;
    s.tr = btn.offsetLeft + btn.offsetWidth;
    return true;
  };

  const tick = (now: number) => {
    const s = phys.current;
    const dt = Math.min(MAX_DT, (now - s.t) / 1000 || 0.016);
    s.t = now;
    const movingRight = s.tr >= s.r && s.tl >= s.l - 0.5;
    const pr = movingRight ? LEAD_SPRING : LAG_SPRING;
    const pl = movingRight ? LAG_SPRING : LEAD_SPRING;
    for (let k = 0; k < 2; k++) {
      [s.l, s.vl] = stepSpringEdge(s.l, s.vl, s.tl, pl.w, pl.z, dt / 2);
      [s.r, s.vr] = stepSpringEdge(s.r, s.vr, s.tr, pr.w, pr.z, dt / 2);
    }
    if (Math.abs(s.l - s.tl) + Math.abs(s.r - s.tr) + Math.abs(s.vl) + Math.abs(s.vr) < SETTLE_EPS) {
      s.l = s.tl;
      s.r = s.tr;
      s.vl = 0;
      s.vr = 0;
      s.raf = 0;
      paint();
      return;
    }
    paint();
    s.raf = requestAnimationFrame(tick);
  };
  const tickRef = useRef(tick);
  tickRef.current = tick;

  /** 直接对齐到目标（首帧、减弱动效、静止时的尺寸变化） */
  const snapToTarget = () => {
    const s = phys.current;
    if (s.raf) {
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    }
    s.l = s.tl;
    s.r = s.tr;
    s.vl = 0;
    s.vr = 0;
    s.initialized = true;
    paint();
  };

  /** 启动（或沿用正在进行的）弹簧动画 */
  const animateToTarget = () => {
    const s = phys.current;
    if (s.raf) return; // 动画进行中：目标已更新，弹簧自然改道
    s.t = performance.now();
    s.raf = requestAnimationFrame((now) => tickRef.current(now));
  };

  const optionsKey = options.map((o) => `${o.value}:${o.badge ?? ''}`).join('|');

  // 选中项变化：绘制前读取目标，首帧直接对齐，之后走弹簧
  useLayoutEffect(() => {
    if (!readTarget()) return;
    const s = phys.current;
    if (!s.initialized || prefersReducedMotion()) {
      snapToTarget();
      return;
    }
    if (Math.abs(s.l - s.tl) + Math.abs(s.r - s.tr) < 0.5 && !s.raf) {
      // 目标未变（如仅 options 引用变化）
      return;
    }
    animateToTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, optionsKey, fullWidth, size]);

  // 容器 / 分段尺寸变化（窗口缩放、字体加载、徽标数字变化）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!readTarget()) return;
      const s = phys.current;
      if (!s.initialized) return;
      if (s.raf) return; // 动画中只改目标，由弹簧平滑吸收
      if (Math.abs(s.l - s.tl) > 0.25 || Math.abs(s.r - s.tr) > 0.25) snapToTarget();
    });
    ro.observe(el);
    btnRefs.current.forEach((b) => {
      if (b) ro.observe(b);
    });
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  useEffect(() => {
    const s = phys.current;
    return () => {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, []);

  const focusAndSelect = (idx: number) => {
    const next = options[idx];
    if (!next) return;
    onChange(next.value);
    btnRefs.current[idx]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    const n = options.length;
    let next: number | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx + n - 1) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === undefined) return;
    e.preventDefault();
    focusAndSelect(next);
  };

  // 高亮底块的上下内缩必须与容器内边距一致，否则底块会比分段高出 1px
  const pad = size === 'sm' ? 'p-1 h-9' : 'p-1 h-10';
  const inset = 'top-1 bottom-1';
  const btnCls = size === 'sm' ? 'px-3 text-xs' : 'px-4 text-xs';
  const isShell = variant === 'shell';

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={`relative items-center rounded-full select-none isolate ${
        isShell
          ? 'border border-[var(--border-hairline)] bg-[var(--bg-card)] shadow-[var(--shadow-shell)]'
          : 'bg-[var(--surface)]'
      } ${fullWidth ? 'flex w-full' : 'inline-flex'} ${pad} ${className}`}
    >
      <span
        ref={highlightRef}
        aria-hidden="true"
        className={`spring-seg-slider mk-seg-slider pointer-events-none absolute left-0 ${inset} rounded-full ${
          isShell
            ? 'bg-[var(--surface)]'
            : 'bg-[var(--bg-card)] shadow-[0_1px_3px_rgba(25,25,20,0.08)]'
        }`}
      />
      {options.map((opt, idx) => {
        const active = idx === activeIdx;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`mk-seg-btn relative z-10 inline-flex h-full items-center justify-center gap-1.5 rounded-full whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              fullWidth ? 'flex-1' : ''
            } ${btnCls} ${
              active ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            {/* 隐形粗体占位 + 实际文字叠放在同一网格单元：宽度恒按 600 字重计算，切换字重不改变布局 */}
            <span className="grid">
              <span
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 font-semibold"
              >
                {opt.label}
              </span>
              <span
                className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${
                  active ? 'font-semibold' : 'font-medium'
                }`}
              >
                {opt.label}
              </span>
            </span>
            {opt.badge !== undefined && (
              <span
                className={`inline-flex items-center justify-center rounded-full px-1.5 py-0 font-mono text-[10px] tabular-nums transition-colors duration-200 ${
                  active
                    ? 'bg-[var(--surface)] text-[var(--ink)]'
                    : 'bg-[var(--bg-card)] text-[var(--ink-muted)]'
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
