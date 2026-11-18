import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlurNumber } from './BlurNumber';
import { prefersReducedMotion } from './mkSpring';

export interface RingSegment {
  id: string;
  label: string;
  shortLabel?: string;
  value: number;
  displayValue: string;
  subLabel?: string;
  color: string;
  rgb?: string;
}

interface TriLinkedRingChartProps {
  segments: RingSegment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  compact?: boolean;
}

interface SegmentAnimState {
  val: number;
  fromVal: number;
  targetVal: number;
  activePos: number;
  activeVel: number;
  targetActive: number;
}

function hexToRgbTuple(color: string): string {
  const c = color.trim();
  const rgbMatch = /^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)/i.exec(c);
  if (rgbMatch) return `${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}`;
  let hex = c.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const n = parseInt(hex, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  return '37, 84, 199';
}

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  const a = angleRad - Math.PI / 2;
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  };
}

function rayOffsetPoint(cx: number, cy: number, angleRad: number, dPar: number, dPerp: number) {
  const a = angleRad - Math.PI / 2;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  return {
    x: cx + dPar * cosA - dPerp * sinA,
    y: cy + dPar * sinA + dPerp * cosA,
  };
}

/**
 * 生成闭式圆角环形扇区路径。
 * 在小占比扇区与极限大扇区下均可生成平行直边间隙与真实圆弧倒角。
 */
function createRoundedDonutArcPath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  gapPx: number,
  targetRc: number
): string {
  const rawSpan = a1 - a0;
  if (rawSpan <= 0.004) return '';

  // 单扇区满环时直接绘制无缺口圆环路径
  if (gapPx <= 0.01 && rawSpan >= Math.PI * 1.999) {
    return [
      `M ${cx.toFixed(2)} ${(cy - r1).toFixed(2)}`,
      `A ${r1.toFixed(2)} ${r1.toFixed(2)} 0 1 1 ${cx.toFixed(2)} ${(cy + r1).toFixed(2)}`,
      `A ${r1.toFixed(2)} ${r1.toFixed(2)} 0 1 1 ${cx.toFixed(2)} ${(cy - r1).toFixed(2)}`,
      `M ${cx.toFixed(2)} ${(cy - r0).toFixed(2)}`,
      `A ${r0.toFixed(2)} ${r0.toFixed(2)} 0 1 0 ${cx.toFixed(2)} ${(cy + r0).toFixed(2)}`,
      `A ${r0.toFixed(2)} ${r0.toFixed(2)} 0 1 0 ${cx.toFixed(2)} ${(cy - r0).toFixed(2)}`,
      'Z',
    ].join(' ');
  }

  const span = Math.min(Math.PI * 1.985, rawSpan);

  const halfSpan = Math.min(Math.PI * 0.97, span * 0.5);
  const sinHalf = Math.sin(halfSpan);

  const emergence = Math.min(1, span / 0.075);
  const effGap = Math.min(gapPx * emergence, r0 * sinHalf * 1.35);
  const g2 = effGap * 0.5;

  const halfThick = (r1 - r0) * 0.48;
  const rc1Max = Math.max(0, (r1 * sinHalf - g2) / (1 + sinHalf));
  const rc0Max = sinHalf < 0.98 ? Math.max(0, (r0 * sinHalf - g2) / (1 - sinHalf)) : halfThick;

  const rc1 = Math.max(0, Math.min(targetRc * emergence, halfThick, rc1Max));
  const rc0 = Math.max(0, Math.min(targetRc * emergence, halfThick, rc0Max));

  const R1c = r1 - rc1;
  const R0c = r0 + rc0;

  const arg1 = Math.min(0.9999, Math.max(0, (g2 + rc1) / R1c));
  const arg0 = Math.min(0.9999, Math.max(0, (g2 + rc0) / R0c));

  const dTheta1 = Math.asin(arg1);
  const dTheta0 = Math.asin(arg0);

  const effA1 = a0 + span;
  const outStartA = a0 + dTheta1;
  const outEndA = effA1 - dTheta1;
  const inStartA = a0 + dTheta0;
  const inEndA = effA1 - dTheta0;

  const dPar1 = Math.sqrt(Math.max(0, R1c * R1c - (g2 + rc1) * (g2 + rc1)));
  const dPar0 = Math.sqrt(Math.max(0, R0c * R0c - (g2 + rc0) * (g2 + rc0)));

  const p1Line = rayOffsetPoint(cx, cy, a0, dPar1, +g2);
  const p1Arc = polarToCartesian(cx, cy, r1, outStartA);

  const p2Arc = polarToCartesian(cx, cy, r1, outEndA);
  const p2Line = rayOffsetPoint(cx, cy, effA1, dPar1, -g2);

  const p3Line = rayOffsetPoint(cx, cy, effA1, dPar0, -g2);
  const p3Arc = polarToCartesian(cx, cy, r0, inEndA);

  const p4Arc = polarToCartesian(cx, cy, r0, inStartA);
  const p4Line = rayOffsetPoint(cx, cy, a0, dPar0, +g2);

  const outerArcSpan = Math.max(0, outEndA - outStartA);
  const innerArcSpan = Math.max(0, inEndA - inStartA);

  const largeOuter = outerArcSpan > Math.PI ? 1 : 0;
  const largeInner = innerArcSpan > Math.PI ? 1 : 0;

  return [
    `M ${p1Line.x.toFixed(2)} ${p1Line.y.toFixed(2)}`,
    rc1 > 0.05
      ? `A ${rc1.toFixed(2)} ${rc1.toFixed(2)} 0 0 1 ${p1Arc.x.toFixed(2)} ${p1Arc.y.toFixed(2)}`
      : `L ${p1Arc.x.toFixed(2)} ${p1Arc.y.toFixed(2)}`,
    outerArcSpan > 0.0005
      ? `A ${r1.toFixed(2)} ${r1.toFixed(2)} 0 ${largeOuter} 1 ${p2Arc.x.toFixed(2)} ${p2Arc.y.toFixed(2)}`
      : '',
    rc1 > 0.05
      ? `A ${rc1.toFixed(2)} ${rc1.toFixed(2)} 0 0 1 ${p2Line.x.toFixed(2)} ${p2Line.y.toFixed(2)}`
      : `L ${p2Line.x.toFixed(2)} ${p2Line.y.toFixed(2)}`,
    `L ${p3Line.x.toFixed(2)} ${p3Line.y.toFixed(2)}`,
    rc0 > 0.05
      ? `A ${rc0.toFixed(2)} ${rc0.toFixed(2)} 0 0 1 ${p3Arc.x.toFixed(2)} ${p3Arc.y.toFixed(2)}`
      : `L ${p3Arc.x.toFixed(2)} ${p3Arc.y.toFixed(2)}`,
    innerArcSpan > 0.0005
      ? `A ${r0.toFixed(2)} ${r0.toFixed(2)} 0 ${largeInner} 0 ${p4Arc.x.toFixed(2)} ${p4Arc.y.toFixed(2)}`
      : '',
    rc0 > 0.05
      ? `A ${rc0.toFixed(2)} ${rc0.toFixed(2)} 0 0 1 ${p4Line.x.toFixed(2)} ${p4Line.y.toFixed(2)}`
      : `L ${p4Line.x.toFixed(2)} ${p4Line.y.toFixed(2)}`,
    'Z',
  ]
    .filter(Boolean)
    .join(' ');
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * TriLinkedRingChart
 * 1) 闭式圆角扇区环形 SVG 路径，配合中心极坐标实时命中检测与 bisector 径向膨胀阴影；
 * 2) 统一 60fps requestAnimationFrame 数值缓动 + 谐振弹簧（stiffness 290 / damping 24）；
 * 3) 圆环扇区、顶部横向多段进度条 (.seg-bar-track)、列表明细行 (.cat-row + 共享滑动底块) 三端严密联动；
 * 4) 中心区域双层叠化 + Odometer 滚动数字与活跃分类标签同步切换。
 */
export function TriLinkedRingChart({
  segments,
  centerValue,
  centerLabel,
  size,
  compact = false,
}: TriLinkedRingChartProps) {
  const effectiveSize = size ?? (compact ? 96 : 156);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  hoveredIdRef.current = hoveredId;

  const enrichedSegments = useMemo(
    () =>
      segments.map((seg) => ({
        ...seg,
        value: Math.max(0, Number.isFinite(seg.value) ? seg.value : 0),
        rgbTuple: seg.rgb ?? hexToRgbTuple(seg.color),
      })),
    [segments]
  );

  const enrichedRef = useRef(enrichedSegments);
  enrichedRef.current = enrichedSegments;

  const totalValue = useMemo(
    () => enrichedSegments.reduce((sum, s) => sum + s.value, 0),
    [enrichedSegments]
  );

  // 动画连续状态（跨帧保存在 ref 内以保持零 React 重渲染开销的 60fps 物理模拟）
  const animStateRef = useRef<Record<string, SegmentAnimState>>({});
  const sliceAnglesRef = useRef<Record<string, { start: number; end: number }>>({});
  const valueTweenRef = useRef({ active: false, start: 0, duration: 460 });
  const rafRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  // DOM 引用
  const svgRef = useRef<SVGSVGElement>(null);
  const arcsGroupRef = useRef<SVGGElement>(null);
  const arcElsRef = useRef<Record<string, SVGPathElement | null>>({});
  const segElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const rowElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const dotElsRef = useRef<Record<string, HTMLSpanElement | null>>({});
  const hoverPillRef = useRef<HTMLDivElement>(null);

  // 初始化或同步新的数值变化到 60fps Tween
  const segmentsSignature = enrichedSegments.map((s) => `${s.id}:${s.value}`).join('|');

  const renderScene = useCallback(() => {
    const list = enrichedRef.current;
    const activeHover = hoveredIdRef.current;
    const anyHovered = activeHover !== null;

    // SVG ViewBox 固定为 240x240，中心 (120, 120)；放大内径以留足中心文案呼吸空间
    const baseCx = 120;
    const baseCy = 120;
    const baseRInner = 80;
    const baseROuter = 103;
    const baseCornerRadius = 5.4;

    let totalSum = 0;
    let positiveCount = 0;
    for (const seg of list) {
      const v = Math.max(0, animStateRef.current[seg.id]?.val ?? seg.value);
      totalSum += v;
      if (v > 0.0001) positiveCount += 1;
    }
    const gapPx = positiveCount <= 1 ? 0 : 4.2;

    if (totalSum <= 0) {
      // 无数据时清空所有活动扇区
      for (const seg of list) {
        const pathEl = arcElsRef.current[seg.id];
        if (pathEl) pathEl.setAttribute('d', '');
        sliceAnglesRef.current[seg.id] = { start: 0, end: 0 };
      }
    } else {
      let currentAngle = 0;
      for (const seg of list) {
        const st = animStateRef.current[seg.id];
        const share = Math.max(0, st ? st.val : seg.value);
        const angleSpan = (share / totalSum) * (Math.PI * 2);
        const startA = currentAngle;
        const endA = currentAngle + angleSpan;

        sliceAnglesRef.current[seg.id] = { start: startA, end: endA };

        const act = Math.max(0, st ? st.activePos : 0);
        // 保持圆心同心与内径稳定，仅向外轻盈延展，避免挤压中心文字或扭曲邻片平行缝隙
        const rInner = baseRInner;
        const rOuter = baseROuter + act * 3.6;
        const cornerRadius = baseCornerRadius + act * 0.8;

        const pathEl = arcElsRef.current[seg.id];
        if (pathEl) {
          const d = createRoundedDonutArcPath(
            baseCx,
            baseCy,
            rInner,
            rOuter,
            startA,
            endA,
            gapPx,
            cornerRadius
          );
          pathEl.setAttribute('d', d);
          const clampedAct = Math.min(1, act);
          const opacity = anyHovered ? 0.42 + 0.58 * clampedAct : 1.0;
          pathEl.style.fillOpacity = opacity.toFixed(3);
          if (act > 0.04) {
            const blur = (2 + act * 3).toFixed(1);
            const yOff = (1 + act * 1.4).toFixed(1);
            const shadowAlpha = Math.min(0.16, act * 0.12).toFixed(3);
            pathEl.style.filter = `drop-shadow(0px ${yOff}px ${blur}px rgba(25, 25, 20, ${shadowAlpha}))`;
          } else {
            pathEl.style.filter = 'none';
          }
          pathEl.style.pointerEvents = angleSpan < 0.008 ? 'none' : 'auto';
        }
        currentAngle = endA;
      }
    }

    // 同步横向分段进度条与明细行视觉状态
    for (const seg of list) {
      const st = animStateRef.current[seg.id];
      const val = Math.max(0, st ? st.val : seg.value);
      const pct = totalSum > 0 ? (val / totalSum) * 100 : 0;
      const act = Math.max(0, st ? st.activePos : 0);
      const clampedAct = Math.min(1, act);

      const segEl = segElsRef.current[seg.id];
      if (segEl) {
        segEl.style.width = `${totalSum > 0 && val > 0 ? Math.max(3.5, pct) : 0}%`;
        segEl.style.display = val > 0 ? 'block' : 'none';
        segEl.style.opacity = (anyHovered ? 0.28 + 0.72 * clampedAct : 1.0).toFixed(3);
        segEl.style.transform = `scaleY(${(1 + act * 0.34).toFixed(3)}) translateY(${(-act * 0.45).toFixed(2)}px)`;
        segEl.style.boxShadow =
          act > 0.05 ? `0 3px 10px rgba(${seg.rgbTuple}, ${(act * 0.36).toFixed(3)})` : 'none';
      }

      const dotEl = dotElsRef.current[seg.id];
      if (dotEl) {
        dotEl.style.transform = `scale(${(1 + act * 0.24).toFixed(3)})`;
        dotEl.style.boxShadow =
          act > 0.05 ? `0 0 0 3.5px rgba(${seg.rgbTuple}, ${(act * 0.22).toFixed(3)})` : 'none';
      }

      const rowEl = rowElsRef.current[seg.id];
      if (rowEl) {
        rowEl.style.opacity = (anyHovered ? 0.44 + 0.56 * clampedAct : 1.0).toFixed(3);
        rowEl.style.transform = `translateX(${(act * 2.5).toFixed(2)}px)`;
      }
    }
  }, []);

  const ensureLoopRunning = useCallback(() => {
    if (rafRef.current) return;
    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTimeRef.current) / 1000));
      lastTimeRef.current = now;

      let stillAnimating = false;
      const list = enrichedRef.current;

      // 1) 数值 Tween
      if (valueTweenRef.current.active) {
        const progress = Math.min(
          1,
          (now - valueTweenRef.current.start) / valueTweenRef.current.duration
        );
        const eased = easeOutCubic(progress);
        for (const seg of list) {
          const st = animStateRef.current[seg.id];
          if (st) {
            st.val = st.fromVal + (st.targetVal - st.fromVal) * eased;
          }
        }
        if (progress < 1) {
          stillAnimating = true;
        } else {
          valueTweenRef.current.active = false;
        }
      }

      // 2) Calibrated smooth spring (stiffness 260, damping 28)
      const stiffness = 260;
      const damping = 28;
      for (const seg of list) {
        const st = animStateRef.current[seg.id];
        if (!st) continue;
        const diff = st.targetActive - st.activePos;
        if (Math.abs(diff) > 0.001 || Math.abs(st.activeVel) > 0.002) {
          const accel = stiffness * diff - damping * st.activeVel;
          st.activeVel += accel * dt;
          st.activePos += st.activeVel * dt;
          stillAnimating = true;
        } else {
          st.activePos = st.targetActive;
          st.activeVel = 0;
        }
      }

      renderScene();

      if (stillAnimating) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [renderScene]);

  // 数值变化时触发平滑 Tween
  useEffect(() => {
    const reduced = prefersReducedMotion();
    let changed = false;

    for (const seg of enrichedSegments) {
      const prev = animStateRef.current[seg.id];
      if (!prev) {
        animStateRef.current[seg.id] = {
          val: seg.value,
          fromVal: seg.value,
          targetVal: seg.value,
          activePos: 0,
          activeVel: 0,
          targetActive: hoveredIdRef.current === seg.id ? 1.0 : 0,
        };
        changed = true;
      } else if (Math.abs(prev.targetVal - seg.value) > 0.0001) {
        prev.fromVal = prev.val;
        prev.targetVal = seg.value;
        if (reduced) prev.val = seg.value;
        changed = true;
      }
    }

    if (changed && !reduced) {
      valueTweenRef.current = { active: true, start: performance.now(), duration: 460 };
      ensureLoopRunning();
    } else {
      renderScene();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentsSignature, ensureLoopRunning, renderScene]);

  // 悬停切换时触发弹簧与共享列表滑块
  useEffect(() => {
    const reduced = prefersReducedMotion();
    for (const seg of enrichedSegments) {
      const st = animStateRef.current[seg.id];
      if (!st) continue;
      st.targetActive = hoveredId === seg.id ? 1.0 : 0;
      if (reduced) {
        st.activePos = st.targetActive;
        st.activeVel = 0;
      }
    }

    // 提升悬停扇区的 SVG z-order 避免投影被邻片遮挡
    if (hoveredId) {
      const activePath = arcElsRef.current[hoveredId];
      const group = arcsGroupRef.current;
      if (activePath && group && activePath.parentNode === group) {
        group.appendChild(activePath);
      }
    }

    // 更新共享滑动行背景条 (.row-hover-pill)
    const pill = hoverPillRef.current;
    if (pill) {
      const targetRow = hoveredId ? rowElsRef.current[hoveredId] : null;
      if (targetRow) {
        pill.style.top = `${targetRow.offsetTop}px`;
        pill.style.height = `${targetRow.offsetHeight}px`;
        pill.style.opacity = '1';
        pill.style.transform = 'scale(1)';
      } else {
        pill.style.opacity = '0';
        pill.style.transform = 'scale(0.985)';
      }
    }

    if (reduced) {
      renderScene();
    } else {
      ensureLoopRunning();
    }
  }, [hoveredId, enrichedSegments, ensureLoopRunning, renderScene]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    },
    []
  );

  // 连续极坐标命中检测（确保微窄扇区也能丝滑触发）
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || totalValue <= 0) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const scaleX = 240 / rect.width;
    const scaleY = 240 / rect.height;
    const x = (e.clientX - rect.left) * scaleX - 120;
    const y = (e.clientY - rect.top) * scaleY - 120;
    const dist = Math.hypot(x, y);

    if (dist < 60 || dist > 118) {
      if (hoveredId !== null) setHoveredId(null);
      return;
    }

    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;

    let matched: string | null = null;
    for (const seg of enrichedSegments) {
      const sector = sliceAnglesRef.current[seg.id];
      if (sector && sector.end - sector.start > 0.005) {
        if (angle >= sector.start && angle <= sector.end) {
          matched = seg.id;
          break;
        }
      }
    }
    if (matched !== hoveredId) {
      setHoveredId(matched);
    }
  };

  const active = enrichedSegments.find((s) => s.id === hoveredId) ?? null;
  const activePct =
    active && totalValue > 0 ? Math.round((active.value / totalValue) * 100) : null;
  const activeShortLabel = active
    ? active.shortLabel ?? (active.label.replace(/\s*Tokens?\b/i, '').trim() || active.label)
    : '';

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-2'}>
      {/* 主体：左侧闭式圆角环形图 + 右侧多段同步条与简洁明细列表 */}
      <div
        className={`flex flex-col sm:flex-row items-center ${
          compact ? 'gap-3.5' : 'gap-6'
        }`}
      >
        {/* 左侧圆角环形图 */}
        <div
          style={{ width: effectiveSize, height: effectiveSize }}
          className="relative flex shrink-0 items-center justify-center"
          onMouseLeave={() => setHoveredId(null)}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 240 240"
            className="h-full w-full overflow-visible touch-manipulation"
            onMouseMove={handleSvgMouseMove}
          >
            {/* 空值完整底座环 */}
            {totalValue <= 0 && (
              <circle
                cx="120"
                cy="120"
                r="91.5"
                fill="none"
                stroke="var(--surface)"
                strokeWidth="23"
              />
            )}
            <g ref={arcsGroupRef}>
              {enrichedSegments.map((seg) => (
                <path
                  key={seg.id}
                  ref={(el) => {
                    arcElsRef.current[seg.id] = el;
                  }}
                  data-id={seg.id}
                  fill={seg.color}
                  className="cursor-pointer will-change-[d,fill-opacity,filter]"
                  onMouseEnter={() => {
                    if (seg.value > 0) setHoveredId(seg.id);
                  }}
                  onClick={() => {
                    if (seg.value > 0) setHoveredId((prev) => (prev === seg.id ? null : seg.id));
                  }}
                />
              ))}
            </g>
          </svg>

          {/* 双层中心读数叠化（纵向分层排版，杜绝长词截断与触碰内环） */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
            <div
              className={`center-layer absolute flex flex-col items-center justify-center ${
                active ? 'layer-exit' : 'layer-active'
              }`}
            >
              <BlurNumber
                mode="odometer"
                value={centerValue}
                className={`${
                  compact ? 'text-[13px]' : 'text-[19px]'
                } font-semibold tracking-tight text-[var(--ink)] leading-none`}
              />
              <span
                className={`truncate font-medium leading-tight text-[var(--ink-muted)] ${
                  compact ? 'mt-1 max-w-[58px] text-[9.5px]' : 'mt-1.5 max-w-[88px] text-[11px]'
                }`}
              >
                {centerLabel}
              </span>
            </div>

            <div
              className={`center-layer absolute flex flex-col items-center justify-center ${
                active ? 'layer-active' : 'layer-enter-init'
              }`}
            >
              {active && (
                compact ? (
                  <>
                    <BlurNumber
                      mode="odometer"
                      value={active.displayValue}
                      className="text-[13px] font-semibold tracking-tight text-[var(--ink)] leading-none"
                    />
                    <span
                      key={`cmp-${active.id}`}
                      className="mk-status-text mt-1 max-w-[60px] truncate text-[9.5px] font-semibold tabular-nums leading-none text-[var(--ink-secondary)]"
                    >
                      {activeShortLabel} {activePct ?? 0}%
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      key={`lbl-${active.id}`}
                      className="mk-status-text inline-flex max-w-[82px] items-center gap-1 text-[11px] font-medium leading-none text-[var(--ink-secondary)]"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: active.color }}
                      />
                      <span className="truncate">{activeShortLabel}</span>
                    </span>
                    <BlurNumber
                      mode="odometer"
                      value={active.displayValue}
                      className="mt-1 text-[18px] font-semibold tracking-tight text-[var(--ink)] leading-none"
                    />
                    <span
                      key={`pct-${active.id}`}
                      className="mk-status-text mt-1 font-mono text-[11px] font-semibold tabular-nums leading-none"
                      style={{ color: active.color }}
                    >
                      {activePct ?? 0}%
                    </span>
                  </>
                )
              )}
            </div>
          </div>
        </div>

        {/* 右侧：横向同步多段条 + 共享滑块简洁分类列表 */}
        <div
          className="w-full flex-1"
          onMouseLeave={() => setHoveredId(null)}
        >
          {/* 1) 三端同步横向分段进度条 */}
          <div className={`flex items-center gap-[3.5px] px-1 ${compact ? 'mb-2 h-3' : 'mb-3 h-3'}`}>
            {totalValue > 0 ? (
              enrichedSegments.map((seg) => (
                <div
                  key={`bar-${seg.id}`}
                  ref={(el) => {
                    segElsRef.current[seg.id] = el;
                  }}
                  onMouseEnter={() => {
                    if (seg.value > 0) setHoveredId(seg.id);
                  }}
                  onClick={() => {
                    if (seg.value > 0) setHoveredId((prev) => (prev === seg.id ? null : seg.id));
                  }}
                  title={`${seg.label}: ${seg.displayValue}`}
                  style={{
                    backgroundColor: seg.color,
                    height: compact ? '8px' : '10px',
                  }}
                  className="shrink-0 cursor-pointer rounded-full will-change-[width,transform,opacity,box-shadow]"
                />
              ))
            ) : (
              <div className="h-2.5 w-full rounded-full bg-[var(--surface)]" />
            )}
          </div>

          {/* 2) 简洁单行明细列表（带共享滑动高亮底块） */}
          <div className="relative flex flex-col gap-0.5">
            <div
              ref={hoverPillRef}
              aria-hidden="true"
              style={{
                opacity: 0,
                top: 0,
                height: 36,
                transition:
                  'top 240ms var(--ease-out-expo), height 220ms var(--ease-out-expo), opacity 160ms ease, transform 220ms var(--ease-out-expo)',
              }}
              className="pointer-events-none absolute left-0 right-0 rounded-[14px] bg-[var(--surface-soft)]"
            />

            {enrichedSegments.map((seg) => {
              const isHovered = hoveredId === seg.id;
              const pct = totalValue > 0 ? Math.round((seg.value / totalValue) * 100) : 0;
              return (
                <div
                  key={seg.id}
                  ref={(el) => {
                    rowElsRef.current[seg.id] = el;
                  }}
                  onMouseEnter={() => {
                    if (seg.value > 0) setHoveredId(seg.id);
                  }}
                  onClick={() => {
                    if (seg.value > 0) setHoveredId((prev) => (prev === seg.id ? null : seg.id));
                  }}
                  style={{
                    transition: 'opacity 180ms ease',
                  }}
                  className={`relative z-10 cursor-pointer rounded-[14px] ${
                    compact ? 'px-2 py-1.5' : 'px-3 py-2'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        ref={(el) => {
                          dotElsRef.current[seg.id] = el;
                        }}
                        className="h-2.5 w-2.5 shrink-0 rounded-full will-change-transform"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="truncate font-medium text-[var(--ink)]">{seg.label}</span>
                      {seg.subLabel && !compact && (
                        <span
                          style={{
                            opacity: isHovered ? 1 : 0,
                            transform: isHovered ? 'translateX(0px)' : 'translateX(-4px)',
                            transition:
                              'opacity 180ms ease, transform 220ms var(--ease-out-expo)',
                          }}
                          className="hidden sm:inline truncate text-[11px] text-[var(--ink-muted)]"
                        >
                          {seg.subLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 font-mono tabular-nums">
                      <span
                        className={`text-xs font-medium ${
                          isHovered ? 'text-[var(--ink)]' : 'text-[var(--ink-secondary)]'
                        }`}
                      >
                        {seg.displayValue}
                      </span>
                      <span className="w-8 text-right text-xs font-semibold text-[var(--ink)]">
                        {pct}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
