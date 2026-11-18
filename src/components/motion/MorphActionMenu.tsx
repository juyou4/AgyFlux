import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DotsThree, X } from '@phosphor-icons/react';
import { MK } from './mkSpring';
import { StatusIcon } from './StatusIcon';

export interface ActionMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  tone?: 'default' | 'danger';
  dividerBefore?: boolean;
  onSelect: () => void | Promise<void>;
}

const ITEM_H = 36;
const DIVIDER_H = 13; // 1px line + 6px top + 6px bottom
const HEADER_H = 42;
const BOTTOM_PAD = 8;

/** 参考 14-项目操作菜单：圆润胶囊圆钮向独立白壳菜单形变展开，带分隔线与危险操作高亮。 */
export function MorphActionMenu({
  label,
  title,
  closeLabel,
  items,
  disabled = false,
}: {
  label: string;
  title: string;
  closeLabel: string;
  items: ActionMenuItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pointerActive, setPointerActive] = useState(false);
  const [geometry, setGeometry] = useState<{ position: CSSProperties; width: number }>({
    position: {},
    width: 220,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const openRef = useRef(false);
  const busyRef = useRef(false);
  const closeTimer = useRef(0);
  const firstFocus = useRef(0);
  const menuId = useId();

  const { offsets, panelHeight } = useMemo(() => {
    const offs: number[] = [];
    let y = 0;
    for (const item of items) {
      if (item.dividerBefore) y += DIVIDER_H;
      offs.push(y);
      y += ITEM_H;
    }
    return { offsets: offs, panelHeight: HEADER_H + y + BOTTOM_PAD };
  }, [items]);

  const close = (refocus: boolean) => {
    if (!openRef.current) return;
    openRef.current = false;
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
    setExpanded(false);
    setPointerActive(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPresent(false), MK.snap.dur + 40);
  };

  const show = (index = 0, viaKeyboard = false) => {
    if (disabled || busyRef.current || !triggerRef.current || items.length === 0) return;
    window.clearTimeout(closeTimer.current);
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.min(220, window.innerWidth - 16);
    const upward = rect.top + panelHeight > window.innerHeight - 10 && rect.bottom >= panelHeight + 10;
    const right = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - width - 8));
    setGeometry({
      width,
      position: {
        right,
        ...(upward ? { bottom: window.innerHeight - rect.bottom } : { top: Math.max(8, rect.top) }),
      },
    });
    firstFocus.current = index;
    setHighlight(index);
    setPointerActive(viaKeyboard);
    openRef.current = true;
    setPresent(true);
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setExpanded(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [open]);

  useEffect(() => {
    if (expanded && open) itemRefs.current[firstFocus.current]?.focus({ preventScroll: true });
  }, [expanded, open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !panelRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        close(false);
      }
    };
    const reposition = (event: Event) => {
      if (!(event.target instanceof Node) || !panelRef.current?.contains(event.target)) close(false);
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const run = async (item: ActionMenuItem) => {
    if (busyRef.current) return;
    close(true);
    busyRef.current = true;
    try {
      const task = item.onSelect();
      if (task) {
        setBusy(true);
        await task;
      }
    } catch {
      // 动作处理函数统一显示失败原因
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const activeDanger = items[highlight]?.tone === 'danger';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || busy}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={present ? menuId : undefined}
        aria-busy={busy}
        onClick={() => (open ? close(true) : show(0, false))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show(event.key === 'ArrowUp' ? items.length - 1 : 0, true);
          } else if (event.key === 'Escape') close(true);
        }}
        className="tactile-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)] disabled:opacity-40"
      >
        {busy ? <StatusIcon state="busy" size={15} /> : <DotsThree size={18} weight="bold" />}
      </button>

      {present &&
        createPortal(
          <div
            ref={panelRef}
            className="mk-action-menu fixed z-[9980] overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-card)]"
            data-expanded={expanded ? 'true' : 'false'}
            aria-hidden={!open}
            inert={!open}
            style={{
              ...geometry.position,
              width: expanded ? geometry.width : 32,
              height: expanded ? panelHeight : 32,
              borderRadius: expanded ? 26 : 16,
              pointerEvents: open ? 'auto' : 'none',
            }}
            onBlur={(event) => {
              if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
                close(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              } else if (event.key === 'Tab') {
                close(true);
              }
            }}
          >
            {/* 右上角圆形关闭按钮（复刻 14-项目操作菜单 .menu-toggle 旋入关闭态） */}
            <button
              type="button"
              aria-label={closeLabel}
              onClick={() => close(true)}
              tabIndex={expanded ? 0 : -1}
              style={{
                opacity: expanded ? 1 : 0,
                transform: expanded ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.7)',
                transition: 'opacity 180ms ease, transform var(--t-snap) var(--sp-snap)',
              }}
              className="tactile-press absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]"
            >
              <X size={13} weight="bold" />
            </button>

            <div
              className="mk-action-menu-content absolute left-0 top-0"
              inert={!expanded}
              aria-hidden={!expanded}
              style={{ width: geometry.width }}
            >
              <div className="flex h-[42px] items-center pl-4 pr-11 text-xs font-semibold text-[var(--ink)]">
                <span className="truncate">{title}</span>
              </div>

              <div
                id={menuId}
                role="menu"
                aria-label={label}
                onPointerEnter={() => setPointerActive(true)}
                onPointerLeave={() => setPointerActive(false)}
                className="relative px-2 pb-2"
              >
                <span
                  aria-hidden="true"
                  className={`mk-action-menu-highlight pointer-events-none absolute left-2 right-2 top-0 h-9 rounded-full transition-opacity duration-150 ${
                    activeDanger ? 'bg-[var(--rose-soft)]' : 'bg-[var(--surface)]'
                  }`}
                  style={{
                    opacity: pointerActive ? 1 : 0,
                    transform: `translateY(${offsets[highlight] ?? 0}px)`,
                  }}
                />

                {items.map((item, index) => {
                  const isDanger = item.tone === 'danger';
                  return (
                    <div key={item.id}>
                      {item.dividerBefore && (
                        <div
                          role="separator"
                          className="mx-2.5 my-[6px] h-px bg-[var(--border-hairline)]"
                        />
                      )}
                      <button
                        ref={(element) => {
                          itemRefs.current[index] = element;
                        }}
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        style={{ '--menu-index': index } as CSSProperties}
                        onPointerEnter={() => {
                          setPointerActive(true);
                          setHighlight(index);
                        }}
                        onFocus={() => {
                          setHighlight(index);
                        }}
                        onClick={() => void run(item)}
                        onKeyDown={(event) => {
                          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                          event.preventDefault();
                          setPointerActive(true);
                          const next =
                            event.key === 'Home'
                              ? 0
                              : event.key === 'End'
                                ? items.length - 1
                                : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
                          itemRefs.current[next]?.focus({ preventScroll: true });
                        }}
                        className={`relative z-10 flex h-9 w-full items-center gap-2.5 rounded-full px-3.5 text-left text-xs font-medium outline-none ${
                          isDanger ? 'text-[var(--rose-ink)]' : 'text-[var(--ink)]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={isDanger ? 'text-[var(--rose)]' : 'text-[var(--ink-secondary)]'}
                        >
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
