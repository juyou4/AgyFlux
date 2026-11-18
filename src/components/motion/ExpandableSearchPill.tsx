import { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';

export interface SearchSuggestion {
  label: string;
  query: string;
  hint?: string;
}

interface ExpandableSearchPillProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suggestions?: SearchSuggestion[];
}

/**
 * ExpandableSearchPill
 * 1) 胶囊从 36px 弹簧横向展开（--sp-snap），输入框与清空键执行 blur(6px)->0 渐现；
 * 2) 若传入 suggestions，支持悬浮面板弹落展开、滑动高亮底块（--sp-snap）、上下键导航与回车选择；
 * 3) 全局快捷键 "/" 唤醒聚焦，Escape 收起或清空。
 */
export function ExpandableSearchPill({
  value,
  onChange,
  placeholder = '搜索邮箱、备注或标签…',
  suggestions = [],
}: ExpandableSearchPillProps) {
  const [expanded, setExpanded] = useState(Boolean(value));
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = expanded || Boolean(value);

  const visibleSuggestions = useMemo(() => {
    if (!suggestions.length) return [];
    const q = value.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter(
      (s) => s.label.toLowerCase().includes(q) || s.query.toLowerCase().includes(q)
    );
  }, [suggestions, value]);

  const showDropdown = open && focused && visibleSuggestions.length > 0;

  useEffect(() => {
    setActiveIdx((idx) => Math.min(idx, Math.max(0, visibleSuggestions.length - 1)));
  }, [visibleSuggestions.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        setExpanded(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setFocused(false);
        if (!value) setExpanded(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [value]);

  const handleOpen = () => {
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleClearOrClose = () => {
    if (value) {
      onChange('');
      inputRef.current?.focus();
    } else {
      setFocused(false);
      setExpanded(false);
    }
  };

  const chooseSuggestion = (item: SearchSuggestion) => {
    onChange(item.query);
    setFocused(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <div
        style={{
          width: open ? '260px' : '36px',
          transition: 'width var(--t-snap) var(--sp-snap), border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease',
        }}
        className={`relative flex h-9 items-center overflow-hidden rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] shadow-[var(--shadow-shell)] ${
          open ? 'border-[var(--border-strong)]' : 'hover:bg-[var(--surface-soft)]'
        }`}
      >
        <button
          type="button"
          onClick={handleOpen}
          aria-label="搜索账号"
          aria-expanded={open}
          className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink)]"
        >
          <MagnifyingGlass size={15} weight="bold" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setActiveIdx(0);
          }}
          onKeyDown={(e) => {
            if (showDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              setActiveIdx(
                (i) => (i + (e.key === 'ArrowDown' ? 1 : visibleSuggestions.length - 1)) % visibleSuggestions.length
              );
              return;
            }
            if (showDropdown && e.key === 'Enter' && visibleSuggestions[activeIdx]) {
              e.preventDefault();
              chooseSuggestion(visibleSuggestions[activeIdx]);
              return;
            }
            if (e.key === 'Escape') {
              onChange('');
              setFocused(false);
              setExpanded(false);
              inputRef.current?.blur();
            }
          }}
          placeholder={placeholder}
          style={{
            opacity: open ? 1 : 0,
            filter: open ? 'blur(0px)' : 'blur(6px)',
            transition: 'opacity 220ms ease, filter 280ms ease',
          }}
          className={`h-full min-w-0 flex-1 bg-transparent pr-2 text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none ${
            open ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        />
        <button
          type="button"
          onClick={handleClearOrClose}
          tabIndex={open ? 0 : -1}
          aria-label={value ? '清空搜索' : '收起搜索'}
          style={{
            opacity: open ? 1 : 0,
            transform: open ? 'scale(1)' : 'scale(0.8)',
            filter: open ? 'blur(0px)' : 'blur(4px)',
            transition: 'opacity 180ms ease, transform var(--t-soft) var(--sp-soft), filter 200ms ease',
          }}
          className={`mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] ${
            open ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {value ? <X size={12} weight="bold" /> : <kbd className="font-mono text-[10px]">/</kbd>}
        </button>
      </div>

      {/* 08-可伸缩搜索框：联想筛选面板 + 全圆角滑动高亮底块 */}
      {suggestions.length > 0 && (
        <div
          role="listbox"
          style={{
            height: showDropdown ? `${visibleSuggestions.length * 36 + 12}px` : '0px',
            opacity: showDropdown ? 1 : 0,
            transform: showDropdown ? 'translateY(0px) scale(1)' : 'translateY(-10px) scale(0.96)',
            filter: showDropdown ? 'blur(0px)' : 'blur(8px)',
            transition:
              'height var(--t-snap) var(--sp-snap), opacity 200ms ease, transform var(--t-snap) var(--sp-snap), filter 260ms ease',
          }}
          className={`absolute left-0 top-[calc(100%+6px)] z-50 w-[260px] overflow-hidden rounded-[24px] border border-[var(--border-hairline)] bg-[var(--bg-card)] shadow-[var(--shadow-popover)] ${
            showDropdown ? 'pointer-events-auto p-1.5' : 'pointer-events-none px-1.5 py-0'
          }`}
        >
          <div className="relative">
            <div
              aria-hidden="true"
              style={{
                transform: `translateY(${activeIdx * 36}px)`,
                opacity: visibleSuggestions.length ? 1 : 0,
                transition: 'transform var(--t-snap) var(--sp-snap), opacity 160ms ease',
              }}
              className="pointer-events-none absolute left-0 right-0 top-0 h-9 rounded-full bg-[var(--surface)]"
            />
            {visibleSuggestions.map((item, idx) => (
              <button
                key={item.query + item.label}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                onPointerEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  chooseSuggestion(item);
                }}
                style={{ '--stagger-index': idx } as React.CSSProperties}
                className="relative z-10 flex h-9 w-full items-center justify-between rounded-full px-3.5 text-left text-xs font-medium text-[var(--ink)]"
              >
                <span className="truncate">{item.label}</span>
                {item.hint && <span className="font-mono text-[10px] text-[var(--ink-muted)]">{item.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
