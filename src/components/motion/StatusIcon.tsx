export type StatusIconState = 'idle' | 'waiting' | 'busy' | 'success' | 'error' | 'cancelled';

/** 任务状态图标：只在状态变化时描边，等待态与执行态分别呈现。 */
export function StatusIcon({ state, size = 18 }: { state: StatusIconState; size?: number }) {
  return (
    <svg key={state} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className="mk-status-icon shrink-0" data-state={state}>
      {state === 'busy' ? (
        <>
          <circle cx="12" cy="12" r="9" opacity=".2" />
          <path className="mk-status-orbit" d="M12 3a9 9 0 0 1 9 9" />
        </>
      ) : (
        <>
          <circle className="mk-status-ring" pathLength="1" cx="12" cy="12" r="9" opacity={state === 'idle' ? '.4' : '.65'} />
          {state === 'success' && <path className="mk-status-mark" pathLength="1" d="m7.5 12 3 3 6-6" />}
          {state === 'error' && <path className="mk-status-mark" pathLength="1" d="m9 9 6 6m0-6-6 6" />}
          {state === 'cancelled' && <path className="mk-status-mark" pathLength="1" d="M8 12h8" />}
          {state === 'waiting' && <path className="mk-status-mark" pathLength="1" d="M12 7v5l3 2" />}
          {state === 'idle' && <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />}
        </>
      )}
    </svg>
  );
}
