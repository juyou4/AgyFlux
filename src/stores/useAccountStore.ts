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

    fetchAccounts: (force?: boolean) => Promise<void>;
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

// 单调请求序号 + 单飞合并，避免并发/慢响应倒灌覆盖刚切换完成的新状态。
let accountsReqSeq = 0;
let currentReqSeq = 0;
let clientsReqSeq = 0;
let inflightFetchAccounts: Promise<void> | null = null;
let queuedFetchAccounts = false;

export const useAccountStore = create<AccountState>((set, get) => ({
    accounts: [],
    currentAccount: null,
    activeClients: null,
    loading: false,
    hasLoadedAccounts: false,
    error: null,

    fetchAccounts: async (force = false) => {
        if (inflightFetchAccounts && !force) {
            queuedFetchAccounts = true;
            return inflightFetchAccounts;
        }

        const run = async (): Promise<void> => {
            const seq = ++accountsReqSeq;
            const currentSeq = ++currentReqSeq;
            const clientSeq = ++clientsReqSeq;
            set({ loading: true, error: null });
            try {
                const [accounts, currentAccount, activeClients] = await Promise.all([
                    accountService.listAccounts(),
                    accountService.getCurrentAccount().catch(() => null),
                    accountService.getActiveClientsStatus().catch(() => null),
                ]);
                if (seq !== accountsReqSeq) return;
                set((state) => ({
                    accounts,
                    currentAccount: currentSeq === currentReqSeq ? currentAccount : state.currentAccount,
                    activeClients: clientSeq === clientsReqSeq ? activeClients : state.activeClients,
                    loading: false,
                    hasLoadedAccounts: true,
                    error: null,
                }));
            } catch (error) {
                if (seq !== accountsReqSeq) return;
                set({ error: String(error), loading: false });
            } finally {
                if (inflightFetchAccounts === promise) {
                    inflightFetchAccounts = null;
                }
                if (queuedFetchAccounts) {
                    queuedFetchAccounts = false;
                    void get().fetchAccounts(true);
                }
            }
        };

        const promise = run();
        inflightFetchAccounts = promise;
        return promise;
    },

    fetchCurrentAccount: async () => {
        const currentSeq = ++currentReqSeq;
        const clientSeq = ++clientsReqSeq;
        try {
            const [account, activeClients] = await Promise.all([
                accountService.getCurrentAccount().catch(() => null),
                accountService.getActiveClientsStatus().catch(() => null),
            ]);
            set((state) => ({
                currentAccount: currentSeq === currentReqSeq ? account : state.currentAccount,
                activeClients: clientSeq === clientsReqSeq ? activeClients : state.activeClients,
            }));
        } catch (error) {
            if (currentSeq === currentReqSeq) {
                set({ error: String(error) });
            }
        }
    },

    fetchActiveClients: async () => {
        const clientSeq = ++clientsReqSeq;
        try {
            const activeClients = await accountService.getActiveClientsStatus();
            if (clientSeq !== clientsReqSeq) return;
            set({ activeClients });
        } catch {
            if (clientSeq !== clientsReqSeq) return;
            // 探测失败后清空旧观察，避免继续显示过期的生效账号。
            set({ activeClients: null });
        }
    },

    addAccount: async (email: string, refreshToken: string) => {
        set({ loading: true, error: null });
        try {
            await accountService.addAccount(email, refreshToken);
            await get().fetchAccounts(true);
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
            await get().fetchAccounts(true);
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
            await get().fetchAccounts(true);
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
            await get().fetchAccounts(true);
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
            await get().fetchAccounts(true);
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
            await get().fetchAccounts(true);
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
        const trimmed = label.trim() || undefined;
        await accountService.updateAccountLabel(accountId, label);
        set((state) => ({
            accounts: state.accounts.map((acc) =>
                acc.id === accountId ? { ...acc, custom_label: trimmed } : acc
            ),
            currentAccount:
                state.currentAccount?.id === accountId
                    ? { ...state.currentAccount, custom_label: trimmed }
                    : state.currentAccount,
        }));
    },

    updateAccountPriority: async (accountId: string, priority: number) => {
        await accountService.updateAccountPriority(accountId, priority);
        await get().fetchAccounts(true);
    },

    updateAccountProjectId: async (accountId: string, projectId: string | null) => {
        await accountService.updateAccountProjectId(accountId, projectId);
        await get().fetchAccounts(true);
    },

    autoFetchAccountProjectId: async (accountId: string) => {
        const pid = await accountService.autoFetchAccountProjectId(accountId);
        await get().fetchAccounts(true);
        return pid;
    },

    warmUpAccount: async (accountId: string) => {
        const msg = await accountService.warmUpAccount(accountId);
        await get().fetchAccounts(true);
        return msg;
    },

    warmUpAllAccounts: async () => {
        const msg = await accountService.warmUpAllAccounts();
        await get().fetchAccounts(true);
        return msg;
    },
}));
