import { useEffect } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RouterProvider } from 'react-router/dom';
import { useTranslation } from 'react-i18next';
import { CloudArrowDown, X } from '@phosphor-icons/react';
import { listen } from '@tauri-apps/api/event';
import Layout from './components/layout/Layout';
import Overview from './pages/Overview';
import Accounts from './pages/Accounts';
import Settings from './pages/Settings';
import MenuBarDashboard from './pages/MenuBarDashboard';
import { ThemeManager } from './components/common/ThemeManager';
import { useConfigStore } from './stores/useConfigStore';
import { useAccountStore } from './stores/useAccountStore';
import { useUpdateStore } from './stores/useUpdateStore';
import { openRelease } from './services/updaterService';
import { isTauri } from './utils/env';
import { installMainWindowPresentation } from './utils/mainWindowPresentation';

const router = createBrowserRouter([
  { path: '/menubar', element: <MenuBarDashboard /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'accounts', element: <Accounts /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

function MinimalUpdatePrompt() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const { updateInfo, isDialogOpen, setDialogOpen } = useUpdateStore();

  if (!isDialogOpen || !updateInfo?.has_update) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9998] w-80 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-popover)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CloudArrowDown size={18} weight="bold" className="text-[var(--accent)]" />
          <span className="text-xs font-semibold text-[var(--ink)]">
            {zh ? `发现新版本 v${updateInfo.latest_version}` : `New Release v${updateInfo.latest_version}`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(false)}
          className="rounded-lg p-1 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <X size={13} weight="bold" />
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--ink-secondary)]">
        {zh
          ? `当前运行 v${updateInfo.current_version}，可前往发布页下载更新包。`
          : `Running v${updateInfo.current_version}. Release notes are ready.`}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setDialogOpen(false)}
          className="rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface)]"
        >
          {zh ? '稍后提醒' : 'Later'}
        </button>
        {updateInfo.release_url && (
          <button
            type="button"
            onClick={() => void openRelease(updateInfo.release_url)}
            className="tactile-press rounded-xl bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-white"
          >
            {zh ? '查看更新' : 'View Release'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const config = useConfigStore((s) => s.config);
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts);
  const fetchActiveClients = useAccountStore((s) => s.fetchActiveClients);
  const { i18n } = useTranslation();

  useEffect(() => {
    void loadConfig();
    if (window.location.pathname !== '/menubar') {
      void fetchAccounts();
    }
  }, [loadConfig, fetchAccounts]);

  // 同步配置文件里的语言设置
  useEffect(() => {
    if (config?.language) {
      const language = config.language.toLowerCase().startsWith('en') ? 'en' : 'zh';
      if (i18n.language !== language) {
        void i18n.changeLanguage(language);
      }
      document.documentElement.dir = 'ltr';
    }
  }, [config?.language, i18n]);

  // 监听 Tauri 后端及系统托盘生命周期事件，并节流监听窗口重新聚焦
  useEffect(() => {
    if (!isTauri()) return;
    const unlistenPromises: Promise<() => void>[] = [];

    unlistenPromises.push(listen('config://updated', () => void loadConfig()));
    if (window.location.pathname === '/menubar') {
      return () => {
        void Promise.all(unlistenPromises).then((listeners) => listeners.forEach((unlisten) => unlisten()));
      };
    }

    unlistenPromises.push(
      installMainWindowPresentation((route) => router.navigate(route, { flushSync: true }))
    );

    unlistenPromises.push(
      listen('tray://account-switched', () => {
        void fetchAccounts(true);
      }),
      listen('tray://refresh-current', () => {
        void fetchAccounts(true);
      }),
      listen('accounts://refreshed', () => {
        void fetchAccounts();
      }),
      listen('menubar://data-updated', () => {
        void fetchAccounts();
      })
    );

    let lastFocusSync = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusSync < 3000) return;
      lastFocusSync = now;
      void fetchActiveClients();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      void Promise.all(unlistenPromises).then((listeners) => listeners.forEach((unlisten) => unlisten()));
    };
  }, [fetchAccounts, fetchActiveClients, loadConfig]);

  // 启动 4 秒后静默检查一次更新
  useEffect(() => {
    if (!isTauri() || window.location.pathname === '/menubar' || !config || config.check_updates_on_startup === false) {
      return;
    }
    const timer = setTimeout(() => {
      void useUpdateStore.getState().checkForUpdates(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [Boolean(config), config?.check_updates_on_startup]);

  return (
    <>
      <ThemeManager />
      <RouterProvider router={router} />
      <MinimalUpdatePrompt />
    </>
  );
}
