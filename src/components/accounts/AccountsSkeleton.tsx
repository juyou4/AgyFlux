/** 首次读取账号时保留列表或卡片的布局，不提前显示空账号提示。 */
export function AccountsSkeleton({ viewMode, zh }: { viewMode: 'cards' | 'list'; zh: boolean }) {
  return (
    <div role="status" aria-busy="true" className="mk-account-skeleton">
      <span className="sr-only">{zh ? '正在加载账号列表' : 'Loading accounts'}</span>
      <div aria-hidden="true" className={viewMode === 'cards' ? 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
        {Array.from({ length: viewMode === 'cards' ? 6 : 4 }, (_, index) => (
          <div key={index} className={`rounded-[28px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-5 ${viewMode === 'list' ? 'flex items-center gap-6' : 'space-y-5'}`}>
            <div className={`flex items-center gap-3 ${viewMode === 'list' ? 'w-1/3' : ''}`}>
              <span className="mk-skeleton h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="mk-skeleton h-3 w-2/3 rounded-full" />
                <div className="mk-skeleton h-2.5 w-5/6 rounded-full" />
              </div>
            </div>
            <div className={`space-y-4 ${viewMode === 'list' ? 'flex-1' : ''}`}>
              {[0, 1].map(row => <div key={row} className="space-y-2">
                <div className="mk-skeleton h-2.5 w-1/3 rounded-full" />
                <div className="mk-skeleton h-1.5 w-full rounded-full" />
              </div>)}
            </div>
            <div className="flex justify-end"><div className="mk-skeleton h-7 w-16 rounded-full" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
