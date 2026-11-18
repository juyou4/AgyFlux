import type { ActiveClientsStatus } from '../types/account';

export type IdentityTarget = 'classic' | 'ide' | 'agy';

// 不用历史选中账号填充实时观察；凭据来源也不等同于运行中的会话。
export function clientIdentity(status: ActiveClientsStatus | null, target: IdentityTarget) {
  const source = status?.[`${target}_source`] ?? 'unavailable';
  return {
    accountId: source === 'unavailable' ? null : status?.[`${target}_account_id`] ?? null,
    email: source === 'unavailable' ? null : status?.[`${target}_email`] ?? null,
    source,
  };
}
