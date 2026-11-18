import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Database,
  Key,
  UserPlus,
  X,
  CircleNotch,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { SpringSegmentedControl } from '../motion/SpringSegmentedControl';
import { OAuthLoginPanel } from './OAuthLoginPanel';
import { showToast } from '../motion/SpringToast';
import * as accountService from '../../services/accountService';
import { useAccountStore } from '../../stores/useAccountStore';

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

type AddMode = 'oauth' | 'token' | 'local';

export function AddAccountDialog({ open, onClose }: AddAccountDialogProps) {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts);

  const [mode, setMode] = useState<AddMode>('oauth');
  const [tokenInput, setTokenInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!mounted) return null;

  const requestClose = () => {
    if (!busy) onClose();
  };

  const handleTokenOrJsonImport = async () => {
    const raw = tokenInput.trim();
    if (!raw) return;
    setBusy(true);
    try {
      if (raw.startsWith('{') || raw.startsWith('[')) {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.accounts) ? parsed.accounts : [parsed];
        let imported = 0;
        for (const item of items) {
          if (item?.refresh_token) {
            await accountService.importAccountTransfer(item);
            imported++;
          }
        }
        await fetchAccounts();
        showToast(zh ? `已导入 ${imported} 个账号` : `Imported ${imported} accounts`, 'success');
      } else {
        const tokens = raw
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const rt of tokens) {
          await accountService.addAccount('', rt);
        }
        await fetchAccounts();
        showToast(zh ? `已添加 ${tokens.length} 个账号` : `Added ${tokens.length} account(s)`, 'success');
      }
      setTokenInput('');
      onClose();
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleLocalScan = async () => {
    setBusy(true);
    try {
      const report = await accountService.importLocalAccountsReport();
      await fetchAccounts();
      const count = report?.accounts?.length ?? 0;
      showToast(
        zh ? `已导入 ${count} 个本机账号` : `Imported ${count} local accounts`,
        'success'
      );
      onClose();
    } catch {
      try {
        const list = await accountService.importFromDb();
        await fetchAccounts();
        showToast(
          zh ? `已导入 ${list.length} 个本机账号` : `Imported ${list.length} local accounts`,
          'success'
        );
        onClose();
      } catch (err) {
        showToast(String(err), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      data-state={closing ? 'closing' : 'open'}
      className="mk-backdrop fixed inset-0 z-[9990] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[3px]"
      onClick={requestClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          requestClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={zh ? '添加账号' : 'Add Account'}
        onClick={(e) => e.stopPropagation()}
        className="mk-dialog max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[32px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-popover)]"
      >
        {/* 21-分享面板风格：左侧胶囊标题条 + 右侧圆形关闭钮 */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-[var(--surface)] px-4">
            <UserPlus size={16} weight="bold" className="shrink-0 text-[var(--ink-secondary)]" />
            <h2 className="truncate text-xs font-semibold text-[var(--ink)]">
              {zh ? '添加账号' : 'Add Account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label={zh ? '关闭' : 'Close'}
            className="tactile-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="mt-3.5">
          <SpringSegmentedControl
            fullWidth
            value={mode}
            onChange={(next) => {
              if (!busy) setMode(next);
            }}
            options={[
              { value: 'oauth', label: zh ? 'Google 授权' : 'OAuth' },
              { value: 'token', label: zh ? '令牌 / JSON' : 'Token / JSON' },
              { value: 'local', label: zh ? '本机扫描' : 'Local Scan' },
            ]}
          />
        </div>

        <div key={mode} className="mk-capsule-switch mt-4 space-y-3.5">
          {mode === 'oauth' && <OAuthLoginPanel zh={zh} onDone={onClose} />}

          {mode === 'token' && (
            <div className="space-y-3">
              <textarea
                rows={4}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={
                  zh
                    ? '粘贴 1//... Refresh Token（支持多行）或导出的 JSON'
                    : 'Paste 1//... refresh token(s) or exported JSON'
                }
                className="w-full resize-none rounded-[22px] bg-[var(--surface-soft)] p-4 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)] transition-colors focus:bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-[var(--border-strong)]"
              />
              <button
                type="button"
                disabled={busy || !tokenInput.trim()}
                onClick={() => void handleTokenOrJsonImport()}
                className="tactile-press flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] text-xs font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)] disabled:opacity-35"
              >
                {busy ? <CircleNotch size={15} className="animate-spin" /> : <Key size={15} weight="bold" />}
                <span>{zh ? '验证并导入' : 'Verify & Import'}</span>
              </button>
            </div>
          )}

          {mode === 'local' && (
            <div className="space-y-3">
              <div className="rounded-[22px] bg-[var(--surface-soft)] p-4 text-xs leading-relaxed text-[var(--ink-secondary)]">
                {zh
                  ? '只读扫描本机 Antigravity 客户端、IDE、agy CLI 与 VS Code 登录凭据，不改动原配置。'
                  : 'Scan local Antigravity App, IDE, agy CLI, and VS Code sessions read-only.'}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleLocalScan()}
                className="tactile-press flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] text-xs font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)] disabled:opacity-50"
              >
                {busy ? <CircleNotch size={15} className="animate-spin" /> : <Database size={15} weight="bold" />}
                <span>{zh ? '扫描并导入' : 'Scan & Import'}</span>
              </button>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
