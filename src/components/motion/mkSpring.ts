/**
 * E:\ui动效\09-视频复刻组件库-23件套 核心物理弹簧曲线与动效引擎 (MK-ENGINE)
 */

export interface MkSpringSpec {
  ease: string;
  dur: number;
}

export const MK: Record<'snap' | 'soft' | 'pop' | 'quick' | 'panel', MkSpringSpec> = {
  snap: {
    ease: 'linear(0,0.0278,0.0973,0.1913,0.297,0.405,0.5089,0.6048,0.6901,0.7638,0.8259,0.877,0.9178,0.9497,0.9738,0.9915,1.0039,1.012,1.0169,1.0193,1.0199,1.0193,1.0179,1.016,1.0139,1.0117,1.0097,1)',
    dur: 340,
  },
  soft: {
    ease: 'linear(0,0.0196,0.0689,0.136,0.2128,0.293,0.3727,0.4491,0.5205,0.5858,0.6448,0.6973,0.7435,0.7839,0.8188,0.8488,0.8745,0.8962,0.9146,0.9301,0.9429,0.9537,0.9625,0.9698,0.9758,0.9807,0.9847,1)',
    dur: 260,
  },
  pop: {
    ease: 'linear(0,0.0312,0.1094,0.2149,0.3328,0.4523,0.5659,0.6687,0.7582,0.8333,0.8943,0.942,0.9779,1.0037,1.021,1.0316,1.0369,1.0384,1.0372,1.0341,1.0301,1.0255,1.0209,1.0166,1.0126,1.0092,1.0063,1)',
    dur: 360,
  },
  quick: {
    ease: 'linear(0,0.0236,0.0833,0.1653,0.2591,0.3568,0.4529,0.5436,0.6265,0.7005,0.7648,0.8198,0.8657,0.9035,0.9338,0.9577,0.9761,0.9899,0.9999,1.0068,1.0112,1.0138,1.015,1.0151,1.0145,1.0135,1.0122,1)',
    dur: 260,
  },
  panel: {
    ease: 'linear(0,0.0279,0.0971,0.19,0.2936,0.3988,0.4997,0.5924,0.6749,0.7464,0.8068,0.8567,0.8972,0.9292,0.9541,0.9729,0.9867,0.9966,1.0032,1.0075,1.0099,1.0109,1.0111,1.0106,1.0097,1.0086,1.0074,1)',
    dur: 360,
  },
};

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 阻尼谐振步进求解器（用于分段选择器/胶囊导航的非对称前沿-后沿弹性拉伸）
 */
export function stepSpringEdge(
  x: number,
  v: number,
  target: number,
  w: number,
  z: number,
  dt: number
): [number, number] {
  const a = -w * w * (x - target) - 2 * z * w * v;
  const nv = v + a * dt;
  const nx = x + nv * dt;
  return [nx, nv];
}

/* ===== [B] 按钮/通知：宽度 FLIP + 内容交叉淡化（复刻 MK-ENGINE reconcile()） ===== */

/** 单个形变元素的跟踪状态：每个组件实例在 useRef 中持有一份 */
export interface MkMorphTrack {
  key: string | null;
  /** 上一次提交时的自然宽度（offsetWidth，不受 transform 缩放影响） */
  width: number | null;
  /** 上一次提交时内容层的 HTML 快照，用作退场“幽灵层” */
  html: string;
  widthAnim: Animation | null;
  ghostAnim: Animation | null;
}

export function createMorphTrack(): MkMorphTrack {
  return { key: null, width: null, html: '', widthAnim: null, ghostAnim: null };
}

export interface MkMorphTargets {
  /** 执行宽度弹簧的元素（通常是按钮本身） */
  box: HTMLElement | null;
  /** 新内容层：执行 blur(8px)+scale(.9) → 清晰 的延迟进场 */
  inner?: HTMLElement | null;
  /** 幽灵层：React 不渲染其子节点的空元素，由这里写入旧内容快照并淡出 */
  ghost?: HTMLElement | null;
  /** 状态键：变化时触发一次形变 */
  key: string;
  /** 宽度曲线选择：默认变宽 MK.snap、变窄 MK.soft（与参考引擎一致） */
  pick?: (from: number, to: number) => MkSpringSpec;
}

/** 加载环在全局时间轴上的相位，用于让幽灵层里的旋转环与原环角度一致、不回跳 */
export function mkSpinnerPhaseDelay(periodMs = 800): string {
  return `-${Math.round(performance.now() % periodMs)}ms`;
}

/**
 * 必须在 useLayoutEffect（浏览器绘制之前）中每次提交都调用：
 * - key 未变：只刷新宽度基线与内容快照；
 * - key 改变：从“上一帧真实宽度”（若上一段弹簧仍在进行则取动画中的当前宽度）弹簧过渡到新自然宽度，
 *   同时旧内容快照 150ms 模糊缩小淡出，新内容 60ms 后 240ms 去模糊浮现。
 * 由于发生在绘制前，不会出现“先闪一帧新宽度再缩回去”的跳变。
 * @returns 本次是否发生了 key 切换
 */
export function commitMorph(track: MkMorphTrack, t: MkMorphTargets): boolean {
  const { box, inner, ghost, key } = t;
  if (!box) return false;
  const running = track.widthAnim && track.widthAnim.playState === 'running' ? track.widthAnim : null;

  // 首次挂载：只记录基线
  if (track.key === null) {
    track.key = key;
    track.width = box.offsetWidth;
    track.html = inner ? inner.innerHTML : '';
    return false;
  }
  if (track.key === key) {
    if (!running) track.width = box.offsetWidth;
    if (inner) track.html = inner.innerHTML;
    return false;
  }

  track.key = key;
  // 起点宽度：动画进行中时 offsetWidth 即为当前帧的动画宽度，保证打断时连续
  const from = running ? box.offsetWidth : track.width;
  running?.cancel();
  track.widthAnim = null;
  box.style.overflow = '';
  const to = box.offsetWidth;
  track.width = to;
  const prevHtml = track.html;
  track.html = inner ? inner.innerHTML : '';

  if (prefersReducedMotion()) {
    track.ghostAnim?.cancel();
    track.ghostAnim = null;
    if (ghost) ghost.innerHTML = '';
    return true;
  }

  // 1) 宽度弹簧：overflow:clip 让溢出的内容被裁切而不是撑破圆角
  if (from !== null && Math.abs(from - to) > 1) {
    const spec = t.pick ? t.pick(from, to) : to > from ? MK.snap : MK.soft;
    box.style.overflow = 'clip';
    const anim = box.animate([{ width: `${from}px` }, { width: `${to}px` }], {
      duration: spec.dur,
      easing: spec.ease,
    });
    track.widthAnim = anim;
    anim.finished.then(
      () => {
        if (track.widthAnim !== anim) return;
        track.widthAnim = null;
        box.style.overflow = '';
        track.width = box.offsetWidth;
      },
      () => {}
    );
  }

  // 2) 内容交叉淡化：旧内容快照退场 + 新内容延迟进场
  if (ghost && inner && prevHtml && prevHtml !== track.html) {
    track.ghostAnim?.cancel();
    ghost.innerHTML = prevHtml;
    ghost.querySelectorAll<HTMLElement>('.mk-spinner').forEach((s) => {
      s.style.animationDelay = mkSpinnerPhaseDelay();
    });
    const out = ghost.animate(
      [
        { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
        { opacity: 0, filter: 'blur(7px)', transform: 'scale(0.9)' },
      ],
      { duration: 150, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
    );
    track.ghostAnim = out;
    out.finished.then(
      () => {
        if (track.ghostAnim !== out) return;
        track.ghostAnim = null;
        ghost.innerHTML = '';
        out.cancel();
      },
      () => {}
    );
    inner.getAnimations().forEach((a) => a.cancel());
    inner.animate(
      [
        { opacity: 0, filter: 'blur(8px)', transform: 'scale(0.9)' },
        { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
      ],
      { duration: 240, delay: 60, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)', fill: 'backwards' }
    );
  }
  return true;
}
