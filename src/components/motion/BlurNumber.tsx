import { useLayoutEffect, useRef, useState } from 'react';
import { MK, prefersReducedMotion } from './mkSpring';

interface BlurNumberProps {
  value: string | number;
  className?: string;
  /**
   * - `crossfade` (默认): MK-ENGINE popNumber 双层叠化 + 方向性模糊位移
   * - `odometer`: 上下文用量弹窗同款逐字符垂直滚轮数字
   */
  mode?: 'crossfade' | 'odometer';
}

/** 单位后缀倍率：让 "980" -> "1.2k" 这类紧凑格式也能判定为“增加” */
const SUFFIX_SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, g: 1e9, t: 1e12 };

function parseLooseNumber(text: string): number {
  const cleaned = text.replace(/,/g, '');
  const match = /(-?\d+(?:\.\d+)?)\s*([kKmMbBgGtT])?/.exec(cleaned);
  if (!match) return NaN;
  const base = parseFloat(match[1]);
  const scale = match[2] ? SUFFIX_SCALE[match[2].toLowerCase()] ?? 1 : 1;
  return base * scale;
}

/** 数值方向：增加 → 1（新值自下方升起），减少 → -1 */
export function parseNumericDirection(prev: string, next: string): 1 | -1 {
  const a = parseLooseNumber(prev);
  const b = parseLooseNumber(next);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
    return b > a ? 1 : -1;
  }
  return 1;
}

/* ------------------------------------------------------------------ */
/* Odometer：逐字符垂直滚轮（复刻 上下文用量弹窗 RollingOdometer）        */
/* ------------------------------------------------------------------ */

interface OdoSlot {
  /** 以“距右端位置”作为稳定 key：位数变化时个位/十位槽保持挂载不被重建 */
  key: string;
  ch: string;
  old: string;
  /** 该槽最近一次变化的序号，用作内部 span 的 key 以重启动画 */
  seq: number;
  dir: 1 | -1;
  animate: boolean;
}

interface OdoState {
  value: string;
  seq: number;
  slots: OdoSlot[];
}

const isDigit = (ch: string) => /[0-9]/.test(ch);

function initOdo(value: string): OdoState {
  const chars = [...value];
  return {
    value,
    seq: 0,
    slots: chars.map((ch, i) => ({
      key: `p${chars.length - 1 - i}`,
      ch,
      old: '',
      seq: 0,
      dir: 1,
      animate: false,
    })),
  };
}

function nextOdo(prev: OdoState, value: string, reduced: boolean): OdoState {
  const seq = prev.seq + 1;
  const dir = parseNumericDirection(prev.value, value);
  const chars = [...value];
  const prevByKey = new Map(prev.slots.map((s) => [s.key, s] as const));

  const slots = chars.map((ch, i): OdoSlot => {
    const key = `p${chars.length - 1 - i}`;
    const before = prevByKey.get(key);
    // 字符未变：原样复用旧槽对象（含其进行中的动画 key），避免被打断或重挂载
    if (before && before.ch === ch) return before;
    const oldCh = before ? before.ch : '';
    // 与参考一致：仅当新旧任一为数字时才滚动；纯符号变化直接替换
    const animate = !reduced && (isDigit(ch) || isDigit(oldCh));
    return { key, ch, old: animate ? oldCh : '', seq, dir, animate };
  });

  return { value, seq, slots };
}

function OdometerValue({ value, className = '' }: { value: string; className?: string }) {
  const [state, setState] = useState(() => initOdo(value));
  let view = state;
  if (state.value !== value) {
    // 渲染期派生状态：同一帧内即得到新字符，避免 useEffect 方案多出的一帧旧值
    view = nextOdo(state, value, prefersReducedMotion());
    setState(view);
  }

  return (
    <span className={`odo-group ${className}`}>
      {/* 读屏只朗读完整数值，逐字符槽位对辅助技术隐藏 */}
      <span className="sr-only">{value}</span>
      {view.slots.map((slot) => {
        const inCls = slot.animate ? (slot.dir >= 0 ? 'odo-up-in' : 'odo-down-in') : '';
        const outCls = slot.dir >= 0 ? 'odo-up-out' : 'odo-down-out';
        return (
          <span key={slot.key} className="odo-slot" aria-hidden="true">
            {slot.animate && slot.old !== '' && (
              <span key={`o${slot.seq}`} className={`odo-char-old ${outCls}`}>
                {slot.old === ' ' ? '\u00A0' : slot.old}
              </span>
            )}
            <span key={`c${slot.seq}`} className={`odo-char-cur ${inCls}`}>
              {slot.ch === ' ' ? '\u00A0' : slot.ch}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Crossfade：MK-ENGINE popNumber（参考 02-购物数量 / 19-点赞 / 17-同步）  */
/* ------------------------------------------------------------------ */

/** 进入：自 y 方向模糊缩放落定（340ms，cubic-bezier(.2,.85,.25,1)） */
const POP_IN = { duration: 340, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)' };
/** 离场：反向上浮模糊退出（200ms，加速曲线） */
const POP_OUT = { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)' };
/** 参考 popNumber 在 24px 字号下位移 14px，这里换算为 em 使各字号比例一致 */
const POP_SHIFT_EM = 0.58;

/** 调用方显式控制宽度 / 截断时不做宽度弹簧，避免与外部布局约束冲突 */
const WIDTH_LOCKED_RE = /(^|\s)(truncate|w-|min-w-|max-w-|basis-|block|flex|grid)/;

function CrossfadeValue({ value, className = '' }: { value: string; className?: string }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const innRef = useRef<HTMLSpanElement>(null);
  const ghostHostRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(value);
  /** 最近一次稳定布局下的根宽度（ResizeObserver 持续更新，用作宽度弹簧起点） */
  const stableWidthRef = useRef<number | null>(null);
  const widthAnimRef = useRef<Animation | null>(null);

  // 记录稳定宽度：ResizeObserver 回调晚于本组件的 layout effect，因此 effect 中读到的总是“变化前”的宽度
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    stableWidthRef.current = root.getBoundingClientRect().width;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      // 宽度动画进行中不覆盖起点，结束后由 finished 回调回写
      if (widthAnimRef.current) return;
      stableWidthRef.current = root.getBoundingClientRect().width;
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const prev = prevRef.current;
    if (prev === value) return;
    prevRef.current = value;

    const root = rootRef.current;
    const inn = innRef.current;
    const host = ghostHostRef.current;
    if (!root || !inn || !host) return;

    if (prefersReducedMotion()) {
      host.replaceChildren();
      inn.getAnimations().forEach((a) => a.cancel());
      return;
    }

    const dir = parseNumericDirection(prev, value);
    const y = POP_SHIFT_EM * dir;

    // 1) 离场层：每次变化独立生成，彼此互不打断；起始帧取当前进场层的实时样式，快速连按时不闪跳
    let fromOpacity = '1';
    let fromFilter = 'blur(0px)';
    let fromTransform = 'translateY(0em) scale(1)';
    const running = inn.getAnimations();
    if (running.length > 0) {
      const cs = getComputedStyle(inn);
      fromOpacity = cs.opacity;
      fromFilter = cs.filter === 'none' ? 'blur(0px)' : cs.filter;
      fromTransform = cs.transform === 'none' ? 'translateY(0em) scale(1)' : cs.transform;
      running.forEach((a) => a.cancel());
    }

    const ghost = document.createElement('span');
    ghost.className = 'mk-pop-number-ghost';
    ghost.textContent = prev;
    host.appendChild(ghost);
    // 同屏离场层最多保留 3 个，避免极端高频变更时堆积
    while (host.childElementCount > 3) host.firstElementChild?.remove();
    ghost
      .animate(
        [
          { opacity: fromOpacity, filter: fromFilter, transform: fromTransform },
          { opacity: 0, filter: 'blur(6px)', transform: `translateY(${-y}em) scale(0.9)` },
        ],
        { ...POP_OUT, fill: 'forwards' }
      )
      .finished.then(
        () => ghost.remove(),
        () => ghost.remove()
      );

    // 2) 进场层
    inn.animate(
      [
        { opacity: 0, filter: 'blur(6px)', transform: `translateY(${y}em) scale(0.9)` },
        { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0em) scale(1)' },
      ],
      POP_IN
    );

    // 3) 宽度弹簧：位数变化时让周围文字平滑让位，而非瞬间跳动
    const fromW = widthAnimRef.current
      ? root.getBoundingClientRect().width
      : stableWidthRef.current;
    widthAnimRef.current?.cancel();
    widthAnimRef.current = null;
    const toW = root.getBoundingClientRect().width;
    const display = getComputedStyle(root).display;
    if (
      fromW !== null &&
      Math.abs(fromW - toW) > 0.5 &&
      display.startsWith('inline') &&
      !WIDTH_LOCKED_RE.test(className)
    ) {
      const anim = root.animate([{ width: `${fromW}px` }, { width: `${toW}px` }], {
        duration: MK.soft.dur,
        easing: MK.soft.ease,
      });
      widthAnimRef.current = anim;
      anim.finished.then(
        () => {
          if (widthAnimRef.current === anim) {
            widthAnimRef.current = null;
            stableWidthRef.current = root.getBoundingClientRect().width;
          }
        },
        () => {}
      );
    } else {
      stableWidthRef.current = toW;
    }
  }, [value, className]);

  // 卸载时停止宽度动画
  useLayoutEffect(
    () => () => {
      widthAnimRef.current?.cancel();
      widthAnimRef.current = null;
    },
    []
  );

  return (
    <span ref={rootRef} className={`mk-pop-number tabular-nums ${className}`}>
      <span ref={innRef} className="mk-pop-number-inn">
        {value}
      </span>
      <span ref={ghostHostRef} aria-hidden="true" className="mk-pop-number-ghosts" />
    </span>
  );
}

/**
 * BlurNumber / MorphText
 * 复刻 E:\ui动效 MK-ENGINE popNumber（02-购物数量、19-点赞、17-同步）与 上下文用量弹窗 Odometer：
 * - crossfade：离场层独立模糊上浮退出（可叠加、不互相打断）+ 进场层反向模糊缩放落定 + 宽度弹簧让位；
 * - odometer：以右端对齐的稳定槽位逐字符滚动，未变化字符不重挂载，位数增减不错位。
 */
export function BlurNumber({ value, className = '', mode = 'crossfade' }: BlurNumberProps) {
  const strVal = String(value);
  if (mode === 'odometer') {
    return <OdometerValue value={strVal} className={className} />;
  }
  return <CrossfadeValue value={strVal} className={className} />;
}
