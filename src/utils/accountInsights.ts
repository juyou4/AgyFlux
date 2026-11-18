import { Account } from '../types/account';
import { getAccountTier } from './accountTier';
import { quotaPoolKind } from './accountDashboard';

export interface PoolWindowSummary {
  remaining: number | null;
  resetTime: string | null;
  hoursLeft: number | null;
}

export interface ExpiringRecommendation {
  account: Account;
  family: 'gemini' | 'other';
  weeklyRemaining: number;
  hoursLeft: number;
  resetTime: string;
}

export interface SmartRecommendation {
  account: Account;
  score: number;
  gemini5h: number | null;
  other5h: number | null;
  reason: 'expiring' | 'best_paid' | 'best_headroom';
  hoursLeft?: number;
}

export function extractPoolWindow(
  account: Account,
  family: 'gemini' | 'other' | 'argon' | 'carbon',
  window: '5h' | 'weekly',
  now = Date.now()
): PoolWindowSummary {
  const groups = account.quota?.quota_groups || [];
  let matchedRemaining: number | null = null;
  let matchedReset: string | null = null;

  for (const group of groups) {
    for (const bucket of group.buckets || []) {
      const kind = quotaPoolKind(bucket.bucket_id, group.display_name);
      if (kind !== family) continue;
      const w = bucket.window.toLowerCase();
      const bId = bucket.bucket_id.toLowerCase();
      const isWeekly = w.includes('week') || w.includes('7d') || bId.includes('week');
      const is5h = w.includes('5h') || w.includes('hour') || bId.includes('5h');
      if ((window === 'weekly' && isWeekly) || (window === '5h' && is5h)) {
        if (bucket.remaining_fraction_known !== false && Number.isFinite(bucket.remaining_fraction)) {
          const pct = Math.round(bucket.remaining_fraction * 100);
          matchedRemaining = matchedRemaining === null ? pct : Math.min(matchedRemaining, pct);
          if (bucket.reset_time && (!matchedReset || Date.parse(bucket.reset_time) < Date.parse(matchedReset))) {
            matchedReset = bucket.reset_time;
          }
        }
      }
    }
  }

  // Respect weekly <= 5% circuit breaker in 5h effective recommendation
  if (matchedRemaining !== null) {
    const hoursLeft = matchedReset ? (Date.parse(matchedReset) - now) / 3600_000 : null;
    return {
      remaining: matchedRemaining,
      resetTime: matchedReset,
      hoursLeft: hoursLeft !== null && Number.isFinite(hoursLeft) && hoursLeft > 0 ? hoursLeft : null,
    };
  }

  return { remaining: null, resetTime: null, hoursLeft: null };
}

export function findExpiringAccounts(accounts: Account[], now = Date.now()): ExpiringRecommendation[] {
  const results: ExpiringRecommendation[] = [];
  for (const account of accounts) {
    if (account.disabled || account.validation_blocked || account.quota?.is_forbidden) continue;
    for (const family of ['gemini', 'other'] as const) {
      const weekly = extractPoolWindow(account, family, 'weekly', now);
      if (
        weekly.remaining !== null &&
        weekly.remaining > 5 &&
        weekly.hoursLeft !== null &&
        weekly.hoursLeft > 0 &&
        weekly.hoursLeft <= 24 &&
        weekly.resetTime
      ) {
        results.push({
          account,
          family,
          weeklyRemaining: weekly.remaining,
          hoursLeft: weekly.hoursLeft,
          resetTime: weekly.resetTime,
        });
      }
    }
  }
  return results.sort((a, b) => a.hoursLeft - b.hoursLeft || b.weeklyRemaining - a.weeklyRemaining);
}

export function findBestRecommendation(
  accounts: Account[],
  excludeAccountId?: string | null,
  now = Date.now()
): SmartRecommendation | null {
  const expiringMap = new Map<string, ExpiringRecommendation>();
  for (const item of findExpiringAccounts(accounts, now)) {
    if (!expiringMap.has(item.account.id)) expiringMap.set(item.account.id, item);
  }

  const candidates = accounts
    .filter((a) => a.id !== excludeAccountId && !a.disabled && !a.validation_blocked && !a.quota?.is_forbidden)
    .map((account) => {
      const tier = getAccountTier(account);
      const isPaid = tier === 'ultra' || tier === 'pro';
      const g5h = extractPoolWindow(account, 'gemini', '5h', now).remaining;
      const gWeek = extractPoolWindow(account, 'gemini', 'weekly', now).remaining;
      const o5h = extractPoolWindow(account, 'other', '5h', now).remaining;
      const oWeek = extractPoolWindow(account, 'other', 'weekly', now).remaining;

      const effectiveGemini = gWeek !== null && gWeek <= 5 ? 0 : (g5h ?? gWeek ?? 0);
      const effectiveOther = oWeek !== null && oWeek <= 5 ? 0 : (o5h ?? oWeek ?? 0);
      const bestHeadroom = Math.max(effectiveGemini, effectiveOther);
      const expiring = expiringMap.get(account.id);
      const priorityBonus = Math.max(0, 100 - (account.priority ?? 50)) * 0.5;
      const score = (expiring ? 2000 : 0) + (isPaid ? 1000 : 0) + bestHeadroom + priorityBonus;

      return {
        account,
        score,
        gemini5h: effectiveGemini,
        other5h: effectiveOther,
        reason: expiring ? ('expiring' as const) : isPaid ? ('best_paid' as const) : ('best_headroom' as const),
        hoursLeft: expiring?.hoursLeft,
        bestHeadroom,
      };
    })
    .filter((item) => item.bestHeadroom > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  const top = candidates[0];
  return {
    account: top.account,
    score: top.score,
    gemini5h: top.gemini5h,
    other5h: top.other5h,
    reason: top.reason,
    hoursLeft: top.hoursLeft,
  };
}

export function formatShortCountdown(isoOrHours: string | number | null | undefined): string {
  if (isoOrHours === null || isoOrHours === undefined) return '—';
  let hours: number;
  if (typeof isoOrHours === 'number') {
    hours = isoOrHours;
  } else {
    const ms = Date.parse(isoOrHours) - Date.now();
    if (!Number.isFinite(ms)) return '—';
    if (ms <= 0) return '已到期';
    hours = ms / 3600_000;
  }
  const mins = Math.max(1, Math.round(hours * 60));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}
