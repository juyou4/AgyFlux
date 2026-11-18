import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';

interface SpringNumberInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (next: number) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * SpringNumberInput
 * 灵感源自 E:\ui动效\09-视频复刻组件库-23件套\components\02-购物数量与结算：
 * 圆润胶囊步进器 + 左右触感圆形加减按钮 + 等宽数字居中输入框。
 */
export function SpringNumberInput({
  value,
  min = 0,
  max = 99999,
  step = 1,
  precision,
  suffix,
  disabled = false,
  onChange,
  ariaLabel,
  className = '',
}: SpringNumberInputProps) {
  const decimals = precision ?? (String(step).includes('.') ? String(step).split('.')[1].length : 0);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) {
      setDraft(decimals > 0 ? value.toFixed(decimals) : String(value));
    }
  }, [value, focused, decimals]);

  const clampValue = (raw: number) => {
    const clamped = Math.max(min, Math.min(max, raw));
    if (decimals <= 0) return Math.round(clamped);
    const factor = Math.pow(10, decimals);
    return Math.round(clamped * factor) / factor;
  };

  const formatNum = (num: number) => (decimals > 0 ? num.toFixed(decimals) : String(num));

  const commitDraft = (rawText: string) => {
    const parsed = Number(rawText.trim());
    if (!Number.isFinite(parsed) || rawText.trim() === '') {
      setDraft(formatNum(value));
      return;
    }
    const clamped = clampValue(parsed);
    setDraft(formatNum(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  const handleStep = (delta: number) => {
    if (disabled) return;
    const next = clampValue(value + delta);
    setDraft(formatNum(next));
    if (next !== value) {
      onChange(next);
    }
  };

  const displayText = focused ? draft : formatNum(value);
  const charWidth = `${Math.max(1.5, displayText.length + 0.35)}ch`;

  return (
    <div
      className={`flex h-10 items-center justify-between gap-1 rounded-full bg-[var(--surface)] p-1 transition-colors focus-within:ring-1 focus-within:ring-[var(--border-strong)] ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        aria-label={ariaLabel ? `${ariaLabel} 减少` : '减少'}
        onClick={() => handleStep(-step)}
        className="tactile-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-card)] text-[var(--ink-secondary)] shadow-[0_1px_2px_rgba(25,25,20,0.06)] hover:text-[var(--ink)] disabled:opacity-35"
      >
        <Minus size={11} weight="bold" />
      </button>

      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-w-0 flex-1 cursor-text items-center justify-center gap-0.5 overflow-hidden px-1"
      >
        <input
          ref={inputRef}
          type="number"
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          step={step}
          aria-label={ariaLabel}
          disabled={disabled}
          min={min}
          max={max}
          value={displayText}
          style={{ width: charWidth }}
          onFocus={() => {
            setFocused(true);
            setDraft(String(value));
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocused(false);
            commitDraft(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitDraft(draft);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setDraft(String(value));
              setFocused(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-0 max-w-full bg-transparent text-center font-mono text-xs font-semibold tabular-nums text-[var(--ink)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix && (
          <span className="shrink-0 select-none text-[11px] font-medium text-[var(--ink-muted)]">{suffix}</span>
        )}
      </div>

      <button
        type="button"
        disabled={disabled || value >= max}
        aria-label={ariaLabel ? `${ariaLabel} 增加` : '增加'}
        onClick={() => handleStep(step)}
        className="tactile-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-card)] text-[var(--ink-secondary)] shadow-[0_1px_2px_rgba(25,25,20,0.06)] hover:text-[var(--ink)] disabled:opacity-35"
      >
        <Plus size={11} weight="bold" />
      </button>
    </div>
  );
}
