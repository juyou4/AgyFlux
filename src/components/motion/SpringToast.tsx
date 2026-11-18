import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react';
import { MK, prefersReducedMotion } from './mkSpring';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastKind;
  exiting?: boolean;
  seq: number;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (message: string, type?: ToastKind) => void;
  dismiss: (id: string) => void;
  dismissLatest: () => void;
}

const timers = new Map<string, number>();

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (message, type = 'info') => {
    const active = get().toasts.find((t) => !t.exiting && t.message === message && t.type === type);
    if (active) {
      // 同文案重复触发时回弹轻推，重置计时器（复刻 07-顶部通知弹窗）
      const prevTimer = timers.get(active.id);
      if (prevTimer) window.clearTimeout(prevTimer);
      set((s) => ({
        toasts: s.toasts.map((t) => (t.id === active.id ? { ...t, seq: t.seq + 1 } : t)),
      }));
      timers.set(
        active.id,
        window.setTimeout(() => get().dismiss(active.id), 3000)
      );
      return;
    }

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, type, exiting: false, seq: 1 }] }));
    timers.set(
      id,
      window.setTimeout(() => get().dismiss(id), 3100)
    );
  },
  dismiss: (id) => {
    const prevTimer = timers.get(id);
    if (prevTimer) {
      window.clearTimeout(prevTimer);
      timers.delete(id);
    }
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 340);
  },
  dismissLatest: () => {
    const visible = get().toasts.filter((t) => !t.exiting);
    const last = visible[visible.length - 1];
    if (last) get().dismiss(last.id);
  },
}));

export function showToast(message: string, type: ToastKind = 'info') {
  useToastStore.getState().push(message, type);
}

function ToastPill({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const firstMount = useRef(true);

  useEffect(() => {
    const el = elRef.current;
    if (!el || prefersReducedMotion()) return;
    if (firstMount.current) {
      firstMount.current = false;
      el.animate(
        [
          { opacity: 0, filter: 'blur(6px)', transform: 'translateY(-44px) scale(0.92)' },
          { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0px) scale(1)' },
        ],
        { duration: MK.snap.dur, easing: MK.snap.ease, fill: 'both' }
      );
    }
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el || toast.seq <= 1 || toast.exiting || prefersReducedMotion()) return;
    el.animate(
      [
        { transform: 'translateY(0px) scale(1)' },
        { transform: 'translateY(5px) scale(0.97)' },
        { transform: 'translateY(0px) scale(1)' },
      ],
      { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
  }, [toast.seq, toast.exiting]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !toast.exiting || prefersReducedMotion()) return;
    el.animate(
      [
        { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0px) scale(1)' },
        { opacity: 0, filter: 'blur(6px)', transform: 'translateY(-44px) scale(0.92)' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
    );
  }, [toast.exiting]);

  const icon =
    toast.type === 'success' ? (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--emerald-soft)] text-[var(--emerald-ink)]">
        <CheckCircle size={14} weight="fill" />
      </span>
    ) : toast.type === 'error' ? (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--rose-soft)] text-[var(--rose-ink)]">
        <WarningCircle size={14} weight="fill" />
      </span>
    ) : (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
        <Info size={14} weight="fill" />
      </span>
    );

  return (
    <div
      ref={elRef}
      role="status"
      className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] py-1.5 pl-2 pr-3 text-xs font-semibold text-[var(--ink)] shadow-[var(--shadow-popover)]"
    >
      {icon}
      <span className="truncate">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="关闭通知"
        className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      >
        <X size={11} weight="bold" />
      </button>
    </div>
  );
}

/**
 * SpringToastContainer
 * 弹簧下拉入场 + 重复触发回弹推力 + Escape 快捷键收起 + 模糊收缩离场完整生命周期。
 */
export function SpringToastContainer() {
  const { toasts, dismiss, dismissLatest } = useToastStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissLatest();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissLatest]);

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-4 left-1/2 z-[10050] flex -translate-x-1/2 flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <ToastPill key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}
