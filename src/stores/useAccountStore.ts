import { create } from 'zustand';
import { Account, ActiveClientsStatus } from '../types/account';
import * as accountService from '../services/accountService';
import { mergeVisibleOrder } from '../utils/accountOrder';

interface AccountState {
    accounts: Account[];
    currentAccount: Account | null;
    activeClients: ActiveClientsStatus | null;
    loading: boolean;
    hasLoadedAccounts: boolean;
    error: string | null;

    fetchAccounts: () => Promise<void>;
    fetchCurrentAccount: () => Promise<void>;
    fetchActiveClients: () => Promise<void>;
    addAccount: (email: string, refreshToken: string) => Promise<void>;
    deleteAccount: (accountId: string) => Promise<void>;
    deleteAccounts: (accountIds: string[]) => Promise<void>;
    switchAccount: (accountId: string, targetIde?: string) => Promise<void>;
    refreshQuota: (accountId: string) => Promise<void>;
    refreshAllQuotas: () => Promise<accountService.RefreshStats>;
    reorderAccounts: (accountIds: string[]) => Promise<void>;
    startOAuthLogin: () => Promise<void>;
    completeOAuthLogin: () => Promise<void>;
    cancelOAuthLogin: () => Promise<void>;
    importFromDb: () => Promise<void>;
    importFromCustomDb: (path: string) => Promise<accountService.AccountFileImportReport>;
    syncAccountFromDb: () => Promise<void>;
    updateAccountLabel: (accountId: string, label: string) => Promise<void>;
    updateAccountPriority: (accountId: string, priority: number) => Promise<void>;
    updateAccountProjectId: (accountId: string, projectId: string | null) => Promise<void>;
    autoFetchAccountProjectId: (accountId: string) => Promise<string>;
    warmUpAccount: (accountId: string) => Promise<string>;
    warmUpAllAccounts: () => Promise<string>;
}

export const useAccountStore = create<AccountState>((set, get) => ({
    accounts: [],
    currentAccount: null,
    activeClients: null,
    loading: false,
    hasLoadedAccounts: false,
    error: null,

    fetchAccounts: async () => {
        set({ loading: true, error: null });
        try {
            const [accounts, currentAccount, activeClients] = await Promise.all([
                accountService.listAccounts(),
                accountService.getCurrentAccount().catch(() => null),
                accountService.getActiveClientsStatus().catch(() => null),
            ]);
            set({ accounts, currentAccount, activeClients, loading: false, hasLoadedAccounts: true });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    fetchCurrentAccount: async () => {
        try {
            const [account, activeClients] = await Promise.all([
                accountService.getCurrentAccount().catch(() => null),
                accountService.getActiveClientsStatus().catch(() => null),
            ]);
            set({ currentAccount: account, activeClients });
        } catch (error) {
            set({ error: String(error) });
        }
    },

    fetchActiveClients: async () => {
        try {
            const activeClients = await accountService.getActiveClientsStatus();
            set({ activeClients });
        } catch {
            // 探测失败后清空旧观察，避免继续显示过期的生效账号。
            set({ activeClients: null });
        }
    },

    addAccount: async (email: string, refreshToken: string) => {
        set({ loading: true, error: null });
        try {
            await accountService.addAccount(email, refreshToken);
            await get().fetchAccounts();
            set({ loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    deleteAccount: async (accountId: string) => {
        set({ loading: true, error: null });
        try {
            await accountService.deleteAccount(accountId);
            await get().fetchAccounts();
            set({ loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    deleteAccounts: async (accountIds: string[]) => {
        set({ loading: true, error: null });
        try {
            await accountService.deleteAccounts(accountIds);
            await get().fetchAccounts();
            set({ loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    switchAccount: async (accountId: string, targetIde?: string) => {
        set({ loading: true, error: null });
        try {
            await accountService.switchAccount(accountId, targetIde);
            await get().fetchAccounts();
            set({ loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    refreshQuota: async (accountId: string) => {
        set({ loading: true, error: null });
        try {
            await accountService.fetchAccountQuota(accountId);
            await get().fetchAccounts();
            set({ loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    refreshAllQuotas: async () => {
        set({ loading: true, error: null });
        try {
            const stats = await accountService.refreshAllQuotas();
            await get().fetchAccounts();
            set({ loading: false });
            return stats;
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    reorderAccounts: async (accountIds: string[]) => {
        const { accounts } = get();
        const accountMap = new Map(accounts.map((acc) => [acc.id, acc]));
        const fullOrder = mergeVisibleOrder(
            accounts.map((acc) => acc.id),
            accountIds
        );
        const finalAccounts = fullOrder
            .map((id) => accountMap.get(id))
            .filter((acc): acc is Account => Boolean(acc));

        set({ accounts: finalAccounts });

        try {
            await accountService.reorderAccounts(fullOrder);
        } catch (error) {
            set({ accounts });
            throw error;
        }
    },

    startOAuthLogin: async () => {
        set({ loading: true, error: null });
        try {
            await accountService.startOAuthLogin();
            await get().fetchAccounts();
            set({ loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    completeOAuthLogin: async () => {
        set({ loading: true, error: null });
        try {
            await accountService.completeOAuthLogin();
            await get().fetchAccounts();
            set({ loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    cancelOAuthLogin: async () => {
        await accountService.cancelOAuthLogin().catch(() => {});
    },

    importFromDb: async () => {
        set({ loading: true, error: null });
        try {
            await accountService.importFromDb();
            await get().fetchAccounts();
            set({ loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    importFromCustomDb: async (path: string) => {
        set({ loading: true, error: null });
        try {
            const report = await accountService.importFromCustomDb(path);
            await get().fetchAccounts();
            set({ loading: false });
            return report;
        } catch (error) {
            set({ error: String(error), loading: false });
            throw error;
        }
    },

    syncAccountFromDb: async () => {
        try {
            const acc = await accountService.syncAccountFromDb();
            if (acc) {
                await get().fetchAccounts();
            }
        } catch {
            // Silent background check
        }
    },

    updateAccountLabel: async (accountId: string, label: string) => {
        await accountService.updateAccountLabel(accountId, label);
        await get().fetchAccounts();
    },

    updateAccountPriority: async (accountId: string, priority: number) => {
        await accountService.updateAccountPriority(accountId, priority);
        await get().fetchAccounts();
    },

    updateAccountProjectId: async (accountId: string, projectId: string | null) => {
        await accountService.updateAccountProjectId(accountId, projectId);
        await get().fetchAccounts();
    },

    autoFetchAccountProjectId: async (accountId: string) => {
        const pid = await accountService.autoFetchAccountProjectId(accountId);
        await get().fetchAccounts();
        return pid;
    },

    warmUpAccount: async (accountId: string) => {
        const msg = await accountService.warmUpAccount(accountId);
        await get().fetchAccounts();
        return msg;
    },

    warmUpAllAccounts: async () => {
        const msg = await accountService.warmUpAllAccounts();
        await get().fetchAccounts();
        return msg;
    },
}));
