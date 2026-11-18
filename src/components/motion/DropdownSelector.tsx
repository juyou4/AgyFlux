import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownSelectorProps<T extends string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  prefixLabel?: string;
  icon?: ReactNode;
  ariaLabel?: string;
  align?: 'left' | 'right';
  fullWidth?: boolean;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

const ROW_H = 36;
const MAX_LIST_H = 252;

/**
 * DropdownSelector
 * 复刻 11-排序下拉菜单 的圆润白壳 + 全圆角胶囊行风格：
 * 1) 持久胶囊触发器（表单内使用无框暖底色胶囊，工具栏使用轻悬浮白壳胶囊）；
 * 2) 弹出面板采用 24px 大圆角白壳与 6px 内边距，内部选项全圆角胶囊化；
 * 3) 悬停与键盘聚焦时平滑滑动底块跟随，勾号简洁对齐。
 */
export function DropdownSelector<T extends string>({
  options,
  value,
  onChange,
  prefixLabel,
  icon,
  ariaLabel,
  align = 'right',
  fullWidth = false,
  size = 'sm',
  disabled = false,
  className = '',
}: DropdownSelectorProps<T>) {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const listboxId = useId();

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusTimer = useRef(0);

  const activeIdx = Math.max(0, options.findIndex((o) => o.value === value));
  const selectedOpt = options[activeIdx] ?? options[0];

  const openMenu = (focusList: boolean) => {
    if (disabled || open) return;
    window.clearTimeout(focusTimer.current);
    setHoverIdx(activeIdx);
    setOpen(true);
    if (focusList) {
      focusTimer.current = window.setTimeout(() => {
        if (listRef.current && listRef.current.contains(document.activeElement)) return;
        optionRefs.current[activeIdx]?.focus({ preventScroll: true });
        if (listRef.current) {
          const listH = Math.min(options.length * ROW_H, MAX_LIST_H);
          const target = activeIdx * ROW_H - (listH - ROW_H) / 2;
          listRef.current.scrollTop = Math.max(0, Math.min(target, listRef.current.scrollHeight - listH));
        }
      }, 60);
    }
  };

  const closeMenu = (refocus: boolean) => {
    if (!open) return;
    window.clearTimeout(focusTimer.current);
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const latest = useRef({ open, closeMenu });
  latest.current = { open, closeMenu };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        latest.current.closeMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (disabled && latest.current.open) latest.current.closeMenu(false);
  }, [disabled]);

  useEffect(() => () => window.clearTimeout(focusTimer.current), []);

  const focusOption = (idx: number) => {
    const n = options.length;
    if (!n) return;
    const i = ((idx % n) + n) % n;
    setHoverIdx(i);
    optionRefs.current[i]?.focus({ preventScroll: true });
  };

  const handleOptionKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusOption(idx + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focusOption(e.key === 'Home' ? 0 : options.length - 1);
    }
  };

  const selectOption = (opt: DropdownOption<T>) => {
    if (opt.value !== value) onChange(opt.value);
    closeMenu(true);
  };

  const heightCls = fullWidth || size === 'md' ? 'h-10' : 'h-9';
  const triggerCls = fullWidth
    ? 'w-full justify-between bg-[var(--surface)] px-4 hover:bg-[var(--surface-hover)]'
    : 'border border-[var(--border-hairline)] bg-[var(--bg-card)] px-3.5 shadow-[var(--shadow-shell)] hover:bg-[var(--surface-soft)]';

  return (
    <div
      ref={rootRef}
      style={{ zIndex: open ? 50 : undefined }}
      className={`relative ${fullWidth ? 'inline-flex w-full' : 'inline-block'} ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          e.stopPropagation();
          closeMenu(true);
        }
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (open && next && rootRef.current && !rootRef.current.contains(next)) closeMenu(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={() => (open ? closeMenu(true) : openMenu(true))}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openMenu(true);
          }
        }}
        className={`tactile-press inline-flex ${heightCls} items-center gap-2 rounded-full text-xs transition-colors disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)] ${
          open && fullWidth ? 'ring-1 ring-[var(--border-strong)] bg-[var(--bg-card)]' : ''
        } ${triggerCls}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {icon && <span className="shrink-0 text-[var(--ink-secondary)]">{icon}</span>}
          {prefixLabel && <span className="shrink-0 font-medium text-[var(--ink-muted)]">{prefixLabel}</span>}
          <span className="truncate font-semibold text-[var(--ink)]">{selectedOpt?.label ?? value}</span>
        </span>
        <CaretDown
          size={12}
          weight="bold"
          className="shrink-0 text-[var(--ink-muted)] transition-transform duration-200 ease-out"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* Anchored floating shell popover */}
      <div
        data-open={open ? 'true' : 'false'}
        aria-hidden={!open}
        inert={!open}
        style={{
          transformOrigin: fullWidth ? 'top center' : align === 'right' ? 'top right' : 'top left',
        }}
        className={`mk-dd-popover absolute ${align === 'right' ? 'right-0' : 'left-0'} top-[calc(100%+6px)] z-50 ${
          fullWidth ? 'w-full min-w-[180px]' : 'min-w-[200px]'
        } rounded-[24px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-1.5 shadow-[var(--shadow-popover)]`}
      >
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="mk-dd-options relative max-h-60 overflow-y-auto overscroll-contain"
        >
          <div className="relative">
            <div
              aria-hidden="true"
              style={{
                height: `${ROW_H}px`,
                transform: `translateY(${hoverIdx * ROW_H}px)`,
              }}
              className="mk-dd-hl pointer-events-none absolute left-0 right-0 top-0 rounded-full bg-[var(--surface)]"
            />
            {options.map((opt, idx) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={idx === hoverIdx ? 0 : -1}
                  onPointerEnter={() => setHoverIdx(idx)}
                  onFocus={() => setHoverIdx(idx)}
                  onKeyDown={(e) => handleOptionKeyDown(e, idx)}
                  onClick={() => selectOption(opt)}
                  style={
                    {
                      '--i': Math.min(idx, 6),
                      height: `${ROW_H}px`,
                    } as React.CSSProperties
                  }
                  className={`mk-dd-option relative z-10 flex w-full items-center justify-between gap-2 rounded-full px-3.5 text-left text-xs outline-none ${
                    selected ? 'font-semibold text-[var(--ink)]' : 'font-medium text-[var(--ink-secondary)]'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {selected && <Check size={13} weight="bold" className="shrink-0 text-[var(--ink)]" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
