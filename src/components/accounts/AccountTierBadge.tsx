import type { AccountTier } from '../../utils/accountTier';
import { OrbitGradientText } from '../motion/OrbitGradientText';

const LABELS: Record<AccountTier, string> = { pro: 'Pro', ultra: 'Ultra', free: 'Free', unknown: 'Unknown' };

/** 套餐分类沿用现有逻辑；展示文案保留服务端给出的付费等级后缀。 */
export function AccountTierBadge({ tier, subscription, variant = 'badge' }: {
  tier: AccountTier;
  subscription?: string | null;
  variant?: 'badge' | 'text';
}) {
  const paid = tier === 'pro' || tier === 'ultra';
  const observed = subscription?.trim();
  const label = paid && observed
    ? observed.replace(/^google\s+ai\s+/i, '').replace(/^(pro|ultra)\b/i, (_, name: string) => LABELS[name.toLowerCase() as AccountTier])
    : LABELS[tier];

  return (
    <span className={`mk-tier-badge mk-tier-badge--${variant}`} data-tier={tier} data-paid={paid}
      title={observed || label}>
      {paid ? <OrbitGradientText>{label}</OrbitGradientText> : label}
    </span>
  );
}
