import { useEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Compass,
  Users,
  SlidersHorizontal,
  Sun,
  Moon,
  Translate,
  AppWindow,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { CapsuleNavbar } from '../motion/CapsuleNavbar';
import { SpringToastContainer, showToast } from '../motion/SpringToast';
import { useConfigStore } from '../../stores/useConfigStore';
import { useAccountStore } from '../../stores/useAccountStore';
import { findExpiringAccounts } from '../../utils/accountInsights';
import { isLinux, isTauri } from '../../utils/env';
import logo from '../../assets/logo.png';

export default function Layout() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const location = useLocation();
  const navigate = useNavigate();
  const { config, saveConfig } = useConfigStore();
  const accounts = useAccountStore((s) => s.accounts);

  const expiringCount = useMemo(() => {
    const ids = new Set(findExpiringAccounts(accounts).map((e) => e.account.id));
    return ids.size;
  }, [accounts]);

  const activeNavId = useMemo(() => {
    if (location.pathname.startsWith('/accounts')) return 'accounts';
    if (location.pathname.startsWith('/settings')) return 'settings';
    return 'overview';
  }, [location.pathname]);

  // 记录上一个导航索引：页面按导航方向（左/右）错位进入，与胶囊滑块运动方向保持一致
  const navOrder = ['overview', 'accounts', 'settings'];
  const prevNavIdxRef = useRef(navOrder.indexOf(activeNavId));
  const curNavIdx = navOrder.indexOf(activeNavId);
  // 只在路由变化时计算一次方向，避免同页重渲染时改写 --page-dx 打断进行中的入场动画
  const pageDx = useMemo(() => {
    const prev = prevNavIdxRef.current;
    return curNavIdx === prev ? 0 : curNavIdx > prev ? 14 : -14;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => {
    prevNavIdxRef.current = curNavIdx;
  }, [curNavIdx]);

  const navItems = useMemo(
    () => [
      { id: 'overview', label: zh ? '概览' : 'Overview', icon: <Compass size={16} weight="bold" /> },
      {
        id: 'accounts',
        label: zh ? '账号' : 'Accounts',
        icon: <Users size={16} weight="bold" />,
        badge: expiringCount > 0 ? expiringCount : undefined,
      },
      { id: 'settings', label: zh ? '设置' : 'Settings', icon: <SlidersHorizontal size={16} weight="bold" /> },
    ],
    [zh, expiringCount]
  );

  const handleNavSelect = (id: string) => {
    if (id === 'overview') navigate('/');
    else if (id === 'accounts') navigate('/accounts');
    else navigate('/settings');
  };

  const isDark =
    config?.theme === 'dark' ||
    ((!config?.theme || config.theme === 'system') &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleTheme = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!config) return;
    const nextTheme = isDark ? 'light' : 'dark';

    if ('startViewTransition' in document && !isLinux()) {
      const x = event.clientX;
      const y = event.clientY;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      // @ts-ignore
      const transition = document.startViewTransition(async () => {
        await saveConfig({ ...config, theme: nextTheme }, true);
      });
      transition.ready.then(() => {
        const toDark = nextTheme === 'dark';
        const clipPath = toDark
          ? [`circle(${endRadius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`]
          : [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`];
        document.documentElement.animate(
          { clipPath },
          {
            duration: 460,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'forwards',
            pseudoElement: toDark ? '::view-transition-old(root)' : '::view-transition-new(root)',
          }
        );
      });
    } else {
      await saveConfig({ ...config, theme: nextTheme }, true);
    }
  };

  const toggleLanguage = async () => {
    if (!config) return;
    const nextLang = zh ? 'en' : 'zh';
    await saveConfig({ ...config, language: nextLang }, true);
    showToast(nextLang === 'zh' ? '已切换为简体中文' : 'Switched to English', 'info');
  };

  const handleOpenMiniPopover = () => {
    navigate('/menubar');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-page)] text-[var(--ink)]">
      <SpringToastContainer />

      {/* Top Navigation Shell */}
      <header
        data-tauri-drag-region={isTauri() ? true : undefined}
        className="sticky top-0 z-40 bg-[var(--bg-header)] backdrop-blur-md"
      >
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Brand */}
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={logo} alt="AgyFlux" className="h-7 w-7 shrink-0 object-contain" />
            <span className="truncate text-sm font-semibold tracking-tight text-[var(--ink)]">
              AgyFlux
            </span>
          </div>

          {/* Center Capsule Nav */}
          <div className="flex items-center justify-center">
            <CapsuleNavbar items={navItems} activeId={activeNavId} onSelect={handleNavSelect} />
          </div>

          {/* Right Utilities Shell */}
          <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-shell)]">
            {!isTauri() && (
              <button
                type="button"
                onClick={handleOpenMiniPopover}
                title={zh ? '打开快捷面板' : 'Open tray popover'}
                className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              >
                <AppWindow size={14} weight="bold" />
                <span className="hidden md:inline">{zh ? '快捷面板' : 'Popover'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void toggleLanguage()}
              aria-label={zh ? '切换语言' : 'Switch language'}
              className="tactile-press inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            >
              <Translate size={14} weight="bold" />
              <span key={zh ? 'zh' : 'en'} className="mk-icon-swap inline-block font-mono text-[11px]">
                {zh ? '中' : 'EN'}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => void toggleTheme(e)}
              aria-label={zh ? '切换主题' : 'Toggle theme'}
              className="tactile-press flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            >
              <span key={isDark ? 'sun' : 'moon'} className="mk-icon-swap mk-icon-swap--spin flex">
                {isDark ? <Sun size={15} weight="bold" /> : <Moon size={15} weight="bold" />}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div
          key={location.pathname}
          className="mk-page-enter"
          style={{ '--page-dx': `${pageDx}px` } as React.CSSProperties}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
