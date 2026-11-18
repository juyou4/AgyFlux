import { create } from 'zustand';
import { AppConfig } from '../types/config';
import * as configService from '../services/configService';

interface ConfigState {
    config: AppConfig | null;
    loading: boolean;
    error: string | null;

    loadConfig: () => Promise<void>;
    saveConfig: (config: AppConfig, silent?: boolean) => Promise<void>;
    updateTheme: (theme: string) => Promise<void>;
    updateLanguage: (language: string) => Promise<void>;
    toggleShowAllQuotas: () => void;
    showAllQuotas: boolean;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
    config: null,
    loading: false,
    error: null,
    showAllQuotas: localStorage.getItem('antigravity_show_all_quotas') === 'true',

    loadConfig: async () => {
        set({ loading: true, error: null });
        try {
            const config = await configService.loadConfig();
            set({ config, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    saveConfig: async (config: AppConfig, silent: boolean = false) => {
        if (!silent) set({ loading: true, error: null });
        try {
            await configService.saveConfig(config);
            set((state) => ({
                config: {
                    ...config,
                    desktop: state.config?.desktop ?? config.desktop,
                    menu_bar: state.config?.menu_bar ?? config.menu_bar,
                    dashboard: state.config?.dashboard ?? config.dashboard,
                },
                loading: false,
            }));
            const { isTauri } = await import('../utils/env');
            if (isTauri()) {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('set_window_theme', { theme: config.theme }).catch(() => {});
            }
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    updateTheme: async (theme: string) => {
        const { config } = get();
        if (!config || config.theme === theme) return;
        await get().saveConfig({ ...config, theme }, true);
    },

    updateLanguage: async (language: string) => {
        const { config } = get();
        if (!config || config.language === language) return;
        await get().saveConfig({ ...config, language }, true);
    },

    toggleShowAllQuotas: () => {
        const next = !get().showAllQuotas;
        localStorage.setItem('antigravity_show_all_quotas', String(next));
        set({ showAllQuotas: next });
    },
}));
