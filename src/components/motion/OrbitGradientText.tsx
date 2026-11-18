import { useEffect, useRef } from 'react';

// 参考 Pro 渐变文字：五组径向色彩沿闭合轨道运行，8.4 秒一个周期。
const ORBITS = [
  { cx: 48, cy: 52, rx: 46, ry: 44, phase: 4.35, harm: 1, r2x: 8, r2y: 6 },
  { cx: 50, cy: 50, rx: 44, ry: 48, phase: 0.35, harm: 1, r2x: 6, r2y: 9 },
  { cx: 52, cy: 50, rx: 48, ry: 44, phase: 1.55, harm: -1, r2x: 7, r2y: 7 },
  { cx: 50, cy: 48, rx: 46, ry: 46, phase: 2.85, harm: 1, r2x: 9, r2y: 6 },
  { cx: 50, cy: 50, rx: 46, ry: 45, phase: 5.55, harm: -1, r2x: 6, r2y: 8 },
];

const mounted = new Set<HTMLElement>();
const visible = new Set<HTMLElement>();
let observer: IntersectionObserver | undefined;
let reduced: MediaQueryList | undefined;
let forcedColors: MediaQueryList | undefined;
let frame = 0;
let previousTime = 0;
let progress = 0;

function coordinates() {
  const t = progress * Math.PI * 2;
  return ORBITS.map(orbit => {
    const angle = orbit.harm * t + orbit.phase;
    const x = orbit.cx + Math.cos(angle) * orbit.rx + Math.sin(2 * t + orbit.phase) * orbit.r2x;
    const y = orbit.cy + Math.sin(angle) * orbit.ry + Math.cos(2 * t - orbit.phase) * orbit.r2y;
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  });
}

function paint(element: HTMLElement, positions: string[]) {
  positions.forEach((position, index) => element.style.setProperty(`--mk-orbit-${index + 1}`, position));
}

function shouldAnimate() {
  return visible.size > 0 && !document.hidden && !reduced?.matches && !forcedColors?.matches;
}

function tick(now: number) {
  frame = 0;
  if (!shouldAnimate()) { previousTime = 0; return; }
  const seconds = previousTime ? Math.min(0.05, (now - previousTime) / 1000) : 0;
  previousTime = now;
  progress = (progress + seconds / 8.4) % 1;
  const positions = coordinates();
  visible.forEach(element => paint(element, positions));
  frame = requestAnimationFrame(tick);
}

function syncLoop() {
  if (shouldAnimate()) {
    if (!frame) frame = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
  }
}

function observe(element: HTMLElement) {
  // 所有标签共享一个时钟，只更新可见文字；隐藏窗口、减弱动态效果时停转。
  if (mounted.size === 0) {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    forcedColors = window.matchMedia('(forced-colors: active)');
    reduced.addEventListener('change', syncLoop);
    forcedColors.addEventListener('change', syncLoop);
    document.addEventListener('visibilitychange', syncLoop);
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const target = entry.target as HTMLElement;
          if (entry.isIntersecting && mounted.has(target)) visible.add(target);
          else visible.delete(target);
        });
        syncLoop();
      });
    }
  }
  mounted.add(element);
  paint(element, coordinates());
  if (observer) observer.observe(element);
  else visible.add(element);
  syncLoop();

  return () => {
    observer?.unobserve(element);
    mounted.delete(element);
    visible.delete(element);
    syncLoop();
    if (mounted.size === 0) {
      observer?.disconnect();
      observer = undefined;
      reduced?.removeEventListener('change', syncLoop);
      forcedColors?.removeEventListener('change', syncLoop);
      document.removeEventListener('visibilitychange', syncLoop);
      reduced = undefined;
      forcedColors = undefined;
    }
  };
}

export function OrbitGradientText({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) return observe(ref.current);
  }, []);

  return <span ref={ref} className="mk-orbit-text">{children}</span>;
}
