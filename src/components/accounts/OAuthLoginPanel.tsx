import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowSquareOut, CaretDown, Copy, Globe } from '@phosphor-icons/react';
import * as accountService from '../../services/accountService';
import { useAccountStore } from '../../stores/useAccountStore';
import { copyToClipboard } from '../../utils/clipboard';
import { isTauri } from '../../utils/env';
import { createOAuthLoginFlow, readOAuthBrowserPreference, writeOAuthBrowserPreference } from '../../utils/oauthLoginFlow';
import { SpringCheckbox } from '../motion/SpringCheckbox';
import { SpringAccordion } from '../motion/SpringAccordion';
import { StatusIcon } from '../motion/StatusIcon';
import { OAuthStatusCard, type OAuthStage } from './OAuthStatusCard';

const primaryButton =
  'tactile-press flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] text-xs font-semibold text-[var(--primary-ink)] hover:bg-[var(--primary-soft-hover)] disabled:opacity-45';
const secondaryButton =
  'tactile-press flex h-9 items-center justify-center gap-1.5 rounded-full bg-[var(--bg-card)] px-3.5 text-xs font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(25,25,20,0.05)] hover:bg-[var(--surface-hover)] disabled:opacity-40';

export function OAuthLoginPanel({ zh, onDone }: { zh: boolean; onDone: () => void }) {
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts);
  const [openBrowser, setOpenBrowser] = useState(readOAuthBrowserPreference);
  const [manualCode, setManualCode] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const manualId = useId();
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(Date.now);

  const flow = useMemo(
    () =>
      createOAuthLoginFlow({
        prepare: accountService.prepareOAuthLogin,
        finish: accountService.finishOAuthLogin,
        cancel: accountService.cancelOAuthLogin,
        submit: (id, code) => accountService.submitOAuthCode(code, undefined, id),
        deliver: async (session, shouldOpen) => {
          if (shouldOpen) {
            await accountService.openOAuthLogin(session.flow_id);
            return 'opened';
          }
          if (!(await copyToClipboard(session.auth_url))) throw new Error('Clipboard unavailable');
          return 'copied';
        },
        onSaved: () => {
          void fetchAccounts();
        },
      }),
    [fetchAccounts]
  );

  const login = useSyncExternalStore(flow.subscribe, flow.getSnapshot);

  useEffect(() => {
    if (['idle', 'error', 'cancelled', 'success'].includes(login.phase)) {
      primaryActionRef.current?.focus({ preventScroll: true });
    }
  }, [login.phase]);

  useEffect(() => () => flow.dismiss(), [flow]);

  useEffect(() => {
    setManualCode('');
    setManualOpen(false);
    if (!login.session) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [login.session]);

  const waiting = login.phase === 'waiting' || login.phase === 'cancelling';
  const active = waiting || login.phase === 'preparing';
  const remaining = Math.max(0, Math.ceil(((login.expiresAt ?? now) - now) / 1000));
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  const stage: OAuthStage = login.phase === 'waiting' && login.callbackSubmitted ? 'saving' : login.phase;

  return (
    <div className="space-y-3">
      <SpringAccordion open={login.phase !== 'success'}>
        <div className="space-y-3">
          {!isTauri() && (
            <p className="rounded-[20px] bg-[var(--surface-soft)] px-3.5 py-2.5 text-[11px] leading-relaxed text-[var(--ink-secondary)]">
              {zh
                ? '预览模式：点击开始后，可在下方手动回调中输入 preview-code 体验完整流程。'
                : 'Preview mode: start and submit preview-code in manual callback to test.'}
            </p>
          )}

          <div
            onClick={() => {
              if (active || login.phase === 'success') return;
              const next = !openBrowser;
              setOpenBrowser(next);
              writeOAuthBrowserPreference(next);
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-full bg-[var(--surface-soft)] px-3.5 py-2 text-xs text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface)]"
          >
            <SpringCheckbox
              checked={openBrowser}
              disabled={active || login.phase === 'success'}
              ariaLabel={zh ? '自动打开浏览器' : 'Open browser automatically'}
              onChange={(value) => {
                setOpenBrowser(value);
                writeOAuthBrowserPreference(value);
              }}
            />
            <span className="font-medium text-[var(--ink)]">{zh ? '自动打开浏览器' : 'Open browser automatically'}</span>
            <span className="ml-auto text-[11px] text-[var(--ink-muted)]">
              {openBrowser ? (zh ? '直接拉起登录' : 'Auto launch') : zh ? '仅复制链接' : 'Copy link'}
            </span>
          </div>
        </div>
      </SpringAccordion>

      <OAuthStatusCard
        stage={stage}
        zh={zh}
        countdown={waiting ? clock : undefined}
        detail={
          login.account?.email ||
          (login.error ? (zh ? '授权未完成，展开查看原因' : 'Expand to review error') : undefined)
        }
      >
        {login.error && (
          <p role="alert" className="break-words rounded-[18px] bg-[var(--rose-soft)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--rose-ink)]">
            {login.error}
          </p>
        )}
        {login.phase === 'success' && (
          <p className="text-[11px] text-[var(--ink-secondary)]">
            {zh ? '配额将在后台自动刷新。' : 'Quota will refresh in the background.'}
          </p>
        )}

        {waiting && login.session && (
          <div className="space-y-2.5">
            <input
              readOnly
              aria-label={zh ? '授权链接' : 'Authorization link'}
              value={login.session.auth_url}
              onFocus={(event) => event.currentTarget.select()}
              className="h-9 w-full min-w-0 rounded-full bg-[var(--bg-card)] px-3.5 font-mono text-[11px] text-[var(--ink-muted)] outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={login.phase !== 'waiting'}
                className={secondaryButton}
                onClick={() => void flow.deliver(false)}
              >
                <Copy size={14} weight="bold" />
                {zh ? '复制链接' : 'Copy link'}
              </button>
              <button
                type="button"
                disabled={login.phase !== 'waiting'}
                className={secondaryButton}
                onClick={() => void flow.deliver(true)}
              >
                <ArrowSquareOut size={14} weight="bold" />
                {zh ? '打开浏览器' : 'Open browser'}
              </button>
            </div>
            <p role="status" className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
              {login.delivery === 'failed'
                ? zh
                  ? '无法自动打开浏览器，请手动复制上方链接完成登录。'
                  : 'Could not open browser. Copy the link above manually.'
                : login.delivery === 'copied'
                  ? zh
                    ? '链接已复制，请在浏览器中完成授权。'
                    : 'Link copied. Complete authorization in your browser.'
                  : zh
                    ? '浏览器授权完成后会自动返回结果。'
                    : 'Keep this window open; result returns automatically.'}
            </p>

            <div className="pt-1 text-xs text-[var(--ink-secondary)]">
              <button
                type="button"
                aria-expanded={manualOpen}
                aria-controls={manualId}
                onClick={() => setManualOpen((value) => !value)}
                className="flex h-8 w-full items-center justify-between rounded-full px-2 text-left text-[11px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none"
              >
                <span>{zh ? '手动粘贴回调地址或授权码' : 'Paste callback URL manually'}</span>
                <CaretDown
                  size={12}
                  weight="bold"
                  className="mk-status-chevron"
                  style={{ transform: manualOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              <SpringAccordion open={manualOpen}>
                <div id={manualId} inert={!manualOpen} aria-hidden={!manualOpen}>
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void flow.submit(manualCode).then((submitted) => {
                        if (submitted) setManualCode('');
                      });
                    }}
                  >
                    <input
                      aria-label={zh ? '回调地址或授权码' : 'Callback URL or code'}
                      autoComplete="off"
                      spellCheck={false}
                      type="text"
                      value={manualCode}
                      onChange={(event) => setManualCode(event.target.value)}
                      disabled={login.phase !== 'waiting' || login.callbackSubmitted}
                      placeholder={zh ? '粘贴回调地址或授权码' : 'Paste callback URL or code'}
                      className="h-9 w-0 min-w-0 flex-1 rounded-full bg-[var(--bg-card)] px-3.5 text-xs text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--border-strong)]"
                    />
                    <button
                      type="submit"
                      disabled={
                        login.phase !== 'waiting' ||
                        login.submitting ||
                        login.callbackSubmitted ||
                        !manualCode.trim()
                      }
                      className={secondaryButton}
                    >
                      {login.submitting && <StatusIcon state="busy" size={14} />}
                      {zh ? '提交' : 'Submit'}
                    </button>
                  </form>
                </div>
              </SpringAccordion>
            </div>
          </div>
        )}
      </OAuthStatusCard>

      {login.phase === 'success' ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="tactile-press flex h-10 items-center justify-center rounded-full bg-[var(--surface)] px-4 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-hover)]"
            onClick={() => void flow.start(openBrowser)}
          >
            {zh ? '继续添加' : 'Add another'}
          </button>
          <button ref={primaryActionRef} type="button" className={primaryButton} onClick={onDone}>
            {zh ? '完成' : 'Done'}
          </button>
        </div>
      ) : (
        !waiting && (
          <button
            ref={primaryActionRef}
            type="button"
            disabled={active}
            onClick={() => void flow.start(openBrowser)}
            className={primaryButton}
          >
            {active ? <StatusIcon state="busy" size={15} /> : <Globe size={15} weight="bold" />}
            {active
              ? zh
                ? '正在准备…'
                : 'Preparing…'
              : login.phase === 'error'
                ? zh
                  ? '重新授权'
                  : 'Try again'
                : openBrowser
                  ? zh
                    ? '打开浏览器授权'
                    : 'Authorize in browser'
                  : zh
                    ? '复制授权链接'
                    : 'Copy login link'}
          </button>
        )
      )}

      {active && (
        <button
          type="button"
          disabled={login.phase === 'cancelling'}
          className="tactile-press flex h-9 w-full items-center justify-center rounded-full bg-[var(--surface)] text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)] disabled:opacity-40"
          onClick={() => void flow.cancel()}
        >
          {zh ? '取消授权' : 'Cancel'}
        </button>
      )}
    </div>
  );
}
