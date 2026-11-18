interface SpringMeterProps {
  /** 0-100 的百分比；null 表示未知（显示空槽） */
  value: number | null;
  /** 填充条颜色类，如 bg-[var(--emerald)] */
  fillClassName: string;
  /** 轨道类（高度、底色、悬停加粗等） */
  className?: string;
  /** 同组多条进度条的入场交错序号 */
  index?: number;
}

/**
 * SpringMeter
 * 1) 填充层恒为满宽，用 translateX 推进（纯合成层，不触发每帧布局，替代原 width 过渡）；
 * 2) 首次挂载时从 0 平滑生长，同组按 index 交错；
 * 3) 数值变化沿用 ease-out-expo 平滑推进，颜色阈值切换渐变。
 */
export function SpringMeter({ value, fillClassName, className = '', index = 0 }: SpringMeterProps) {
  const pct = value === null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={`overflow-hidden rounded-full ${className}`}>
      <div
        className={`mk-meter-fill mk-meter-fill--enter ${fillClassName}`}
        style={{ '--meter-pct': `${pct}%`, '--meter-index': index } as React.CSSProperties}
      />
    </div>
  );
}
