import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface CapsuleNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

interface CapsuleNavbarProps {
  items: CapsuleNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

/* 几何常量：与下方 Tailwind 类（p-1.5 / h-9）保持一致 */
const NAV_PAD = 6; // nav 内边距，滑块起点
const PAD_L = 12; // 按钮左内边距：图标始终锚定在此处，选中/取消时不会横移
const PAD_R_SELECTED = 16; // 选中态右内边距（文字收尾处的视觉补偿）
const LABEL_GAP = 7; // 图标与标签间距（计入标签槽宽度，随曲线一起展开，避免 gap 瞬跳）
const BADGE_GAP = 8; // 标签与内联角标间距

interface NavMetrics {
  icon: number[];
  label: number[];
  badge: number[];
}

/** 读取元素未受祖先 transform 影响的真实宽度（向上取整，防止文字末端被裁 0.x px） */
function measureWidth(el: HTMLElement | null, scale: number): number {
  if (!el) return 0;
  return Math.ceil(el.getBoundingClientRect().width / scale - 0.01);
}

function sameMetrics(a: NavMetrics | null, b: NavMetrics): boolean {
  if (!a) return false;
  const eq = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return eq(a.icon, b.icon) && eq(a.label, b.label) && eq(a.badge, b.badge);
}

/**
 * CapsuleNavbar
 * 1) 按钮宽度与滑块的 translateX、width 共用 --sp-snap / --t-snap 曲线。
 *    先测量图标、标签和角标的固有宽度，
 *    再算出每个按钮的显式像素宽度，让按钮、标签槽、滑块三者在同一曲线上同步收放，不会互相追赶抖动；
 * 2) 标签：取消选中 opacity .18s / blur .24s 立即淡出；选中时延迟 90ms 再以 .32s 去模糊浮现；
 *    标签槽宽度为真实文字宽度（非 max-width 估值），因此弹簧曲线不失真；
 * 3) 角标：始终绝对定位并锚定按钮右缘，仅用 transform 在“图标右上角”与“标签尾部内联位”之间滑动，
 *    白色描边环随之收起，不再发生 absolute ↔ 文档流切换导致的跳变；
 * 4) 首帧在绘制前完成测量与定位，并在就绪前禁用所有过渡，滑块不会从 0 处滑入；
 * 5) 支持 ArrowLeft / ArrowRight / Home / End 键盘导航；尊重 prefers-reduced-motion。
 */
export function CapsuleNavbar({ items, activeId, onSelect }: CapsuleNavbarProps) {
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const iconRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const badgeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [metrics, setMetrics] = useState<NavMetrics | null>(null);
  // 首次测量完成并绘制后才开启过渡，避免初始定位产生动画
  const [animReady, setAnimReady] = useState(false);

  const measure = () => {
    const nav = navRef.current;
    if (!nav) return;
    const scale = nav.offsetWidth > 0 ? nav.getBoundingClientRect().width / nav.offsetWidth || 1 : 1;
    const next: NavMetrics = {
      icon: items.map((_, i) => measureWidth(iconRefs.current[i], scale)),
      label: items.map((_, i) => measureWidth(labelRefs.current[i], scale)),
      badge: items.map((_, i) => measureWidth(badgeRefs.current[i], scale)),
    };
    setMetrics((prev) => (sameMetrics(prev, next) ? prev : next));
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;

  const itemsKey = items.map((i) => `${i.id}:${i.label}:${i.badge ?? ''}`).join('|');

  // 绘制前同步测量（标签/角标/语言变化时重新测量）
  useLayoutEffect(() => {
    measureRef.current();
  }, [itemsKey]);

  // 字体异步加载、图标尺寸变化等情况由 ResizeObserver 兜底重新测量
  useEffect(() => {
    const ro = new ResizeObserver(() => measureRef.current());
    [...iconRefs.current, ...labelRefs.current, ...badgeRefs.current].forEach((el) => {
      if (el) ro.observe(el);
    });
    return () => ro.disconnect();
  }, [itemsKey]);

  useEffect(() => {
    if (!metrics || animReady) return;
    // 双 rAF：确保“无过渡”的初始几何已经提交绘制，再开启过渡
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setAnimReady(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [metrics, animReady]);

  const activeIdx = Math.max(0, items.findIndex((i) => i.id === activeId));
  const hasBadge = (item: CapsuleNavItem) => item.badge !== undefined && item.badge > 0;

  // 计算每项的收起宽度 / 展开宽度 / 标签槽宽度
  const geo = items.map((item, i) => {
    const icon = metrics?.icon[i] ?? 16;
    const label = metrics?.label[i] ?? 0;
    const badge = hasBadge(item) ? metrics?.badge[i] ?? 0 : 0;
    const collapsed = PAD_L * 2 + icon;
    const slot = LABEL_GAP + label + (badge ? BADGE_GAP + badge : 0);
    const expanded = PAD_L + icon + slot + PAD_R_SELECTED;
    return { collapsed, expanded, slot };
  });

  const indicatorX = NAV_PAD + geo.slice(0, activeIdx).reduce((sum, g) => sum + g.collapsed, 0);
  const indicatorW = geo[activeIdx]?.expanded ?? 0;

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const nextIdx =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : (idx + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length;
    const target = items[nextIdx];
    if (target) {
      onSelect(target.id);
      itemRefs.current[nextIdx]?.focus();
    }
  };

  return (
    <nav
      ref={navRef}
      aria-label="主导航"
      data-anim={animReady ? 'on' : 'off'}
      className="mk-capnav relative inline-flex items-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] p-1.5 shadow-[var(--shadow-shell)] select-none isolate"
    >
      {/* 共享反色滑块：translateX + width 与按钮宽度共用 --sp-snap 曲线 */}
      <span
        aria-hidden="true"
        style={{
          opacity: metrics ? 1 : 0,
          width: `${indicatorW}px`,
          transform: `translateX(${indicatorX}px)`,
        }}
        className="mk-capnav-indicator pointer-events-none absolute left-0 top-1.5 bottom-1.5 rounded-full bg-[var(--nav-pill)]"
      />
      {items.map((item, idx) => {
        const selected = idx === activeIdx;
        const g = geo[idx];
        const badgeOn = hasBadge(item);
        return (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            type="button"
            aria-label={badgeOn ? `${item.label} (${item.badge})` : item.label}
            aria-current={selected ? 'page' : undefined}
            data-selected={selected ? 'true' : 'false'}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            style={{
              width: metrics ? `${selected ? g.expanded : g.collapsed}px` : undefined,
              paddingLeft: `${PAD_L}px`,
              paddingRight: metrics ? 0 : `${PAD_L}px`,
            }}
            className={`mk-capnav-item relative z-10 inline-flex h-9 shrink-0 items-center justify-start rounded-full text-left text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              selected
                ? 'text-[var(--bg-card)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]'
            }`}
          >
            <span
              ref={(el) => {
                iconRefs.current[idx] = el;
              }}
              className="flex shrink-0 items-center justify-center"
            >
              {item.icon}
            </span>
            {/* 标签槽：宽度 = 间距 + 真实文字宽度 (+ 内联角标占位)，与按钮宽度同曲线展开 */}
            <span
              aria-hidden="true"
              style={{ width: metrics ? `${selected ? g.slot : 0}px` : selected ? undefined : 0 }}
              className="mk-capnav-slot block shrink-0 overflow-hidden text-left whitespace-nowrap"
            >
              <span
                ref={(el) => {
                  labelRefs.current[idx] = el;
                }}
                style={{ marginLeft: `${LABEL_GAP}px` }}
                className="mk-capnav-label inline-block w-max align-middle leading-none"
              >
                {item.label}
              </span>
            </span>
            {badgeOn && (
              <span
                aria-hidden="true"
                className="mk-capnav-badge pointer-events-none absolute right-0 top-1/2"
                style={{
                  transform: selected
                    ? `translate(-${PAD_R_SELECTED}px, -50%)`
                    : 'translate(-1px, calc(-50% - 9px)) scale(0.86)',
                }}
              >
                <span
                  ref={(el) => {
                    badgeRefs.current[idx] = el;
                  }}
                  className={`mk-capnav-badge-dot inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none tabular-nums ${
                    selected
                      ? 'bg-white/20 text-[var(--bg-card)]'
                      : 'bg-[var(--surface-hover)] text-[var(--ink)]'
                  }`}
                >
                  {item.badge}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
