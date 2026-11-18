import { Check } from '@phosphor-icons/react';

interface SpringCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * SpringCheckbox
 * 自定义超椭圆/圆润复选框，勾选态使用 --sp-snap 弹簧缩放浮现对勾。
 */
export function SpringCheckbox({
  checked,
  onChange,
  disabled = false,
  title,
  ariaLabel,
  className = '',
}: SpringCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel ?? title}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      style={{ transitionTimingFunction: 'var(--sp-snap)' }}
      className={`tactile-press flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200 disabled:opacity-45 ${
        checked
          ? 'border-[var(--primary-solid)] bg-[var(--primary-solid)] text-[var(--bg-card)]'
          : 'border-[var(--border-strong)] bg-transparent text-transparent hover:border-[var(--ink-secondary)]'
      } ${className}`}
    >
      <Check
        size={11}
        weight="bold"
        style={{ transition: 'transform 220ms var(--sp-snap), opacity 160ms ease' }}
        className={checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}
      />
    </button>
  );
}
