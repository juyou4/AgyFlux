import { request as invoke } from '../utils/request';
import type { AppConfig, DesktopPreferences, MenuBarPreferences, MenuBarQuotaScope } from '../types/config';

export interface DesktopStatus {
    platform: string;
    tray_available: boolean;
    autostart_supported: boolean;
    launch_at_login: boolean | null;
    autostart_error?: string | null;
    dock_error?: string | null;
    hide_dock_icon: boolean;
    start_minimized: boolean;
}

export interface AppExperimentsStatus {
    available?: boolean;
    version?: string;
    translation_enabled?: boolean;
    translated?: number;
    state?: string;
    supported?: boolean;
}

export async function loadConfig(): Promise<AppConfig> {
    return await invoke<AppConfig>('load_config');
}

export async function saveConfig(config: AppConfig): Promise<void> {
    return await invoke<void>('save_config', { config });
}

export async function getDesktopSettings(): Promise<DesktopStatus> {
    return await invoke<DesktopStatus>('get_desktop_settings');
}

export async function setDesktopPreferences(patch: Partial<DesktopPreferences>): Promise<DesktopStatus> {
    return await invoke<DesktopStatus>('set_desktop_preferences', { patch });
}

export async function setMenuBarPreferences(params: {
    quotaScope?: MenuBarQuotaScope;
    patch?: Partial<MenuBarPreferences>;
}): Promise<MenuBarPreferences> {
    return await invoke<MenuBarPreferences>('set_menu_bar_preferences', params);
}

export async function getDataDirPath(): Promise<string> {
    return await invoke<string>('get_data_dir_path');
}

export async function openDataFolder(): Promise<void> {
    return await invoke<void>('open_data_folder');
}

export async function getAppExperiments(): Promise<AppExperimentsStatus> {
    return await invoke<AppExperimentsStatus>('get_app_experiments');
}

export async function setAppTranslation(enabled: boolean): Promise<boolean> {
    return await invoke<boolean>('set_app_translation', { enabled });
}
