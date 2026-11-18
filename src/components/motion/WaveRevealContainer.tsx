import { ReactNode, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './mkSpring';

interface WaveRevealContainerProps {
  /** 每当该 key 递增且 > 0 时，触发一次自右向左的斜向模糊揭示扫光 */
  waveKey: number;
  children: ReactNode;
  className?: string;
}

/**
 * WaveRevealContainer
 * 当配额刷新或异步数据落盘时，在容器上层执行一次自右向左的柔和斜带光束揭示。
 */
export function WaveRevealContainer({ waveKey, children, className = '' }: WaveRevealContainerProps) {
  const [beamId, setBeamId] = useState(0);
  const prevKey = useRef(waveKey);

  useEffect(() => {
    if (waveKey <= 0 || waveKey === prevKey.current) return;
    prevKey.current = waveKey;
    if (prefersReducedMotion()) return;
    setBeamId(waveKey);
    const t = window.setTimeout(() => setBeamId(0), 920);
    return () => window.clearTimeout(t);
  }, [waveKey]);

  return (
    <div className={`mk-reveal-wave ${className}`}>
      {beamId > 0 && <div key={beamId} aria-hidden="true" className="mk-reveal-wave-beam" />}
      {children}
    </div>
  );
}
