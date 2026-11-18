export interface OAuthLoginSession {
  flow_id: string;
  auth_url: string;
  expires_in: number;
}

export interface OAuthLoginState<T> {
  phase: 'idle' | 'preparing' | 'waiting' | 'cancelling' | 'cancelled' | 'success' | 'error';
  session?: OAuthLoginSession;
  expiresAt?: number;
  account?: T;
  error?: string;
  delivery?: 'opened' | 'copied' | 'failed';
  submitting: boolean;
  callbackSubmitted: boolean;
}

interface LoginDependencies<T> {
  prepare: () => Promise<OAuthLoginSession>;
  finish: (flowId: string) => Promise<T>;
  cancel: (flowId: string) => Promise<boolean>;
  submit: (flowId: string, code: string) => Promise<void>;
  deliver: (session: OAuthLoginSession, openBrowser: boolean) => Promise<'opened' | 'copied'>;
  onSaved: (account: T) => void;
  now?: () => number;
}

const initialState = <T>(): OAuthLoginState<T> => ({ phase: 'idle', submitting: false, callbackSubmitted: false });
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/** 每次登录只创建一个等待者；手动回调投递到同一会话，旧请求不更新新界面。 */
export function createOAuthLoginFlow<T>(deps: LoginDependencies<T>) {
  let state = initialState<T>();
  let generation = 0;
  let owned: { generation: number; session: OAuthLoginSession; completion: Promise<void> } | undefined;
  let preparationQueue = Promise.resolve();
  const listeners = new Set<() => void>();
  const update = (next: OAuthLoginState<T>) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const patch = (next: Partial<OAuthLoginState<T>>) => update({ ...state, ...next });

  async function deliver(openBrowser: boolean) {
    const current = owned;
    if (!current || state.phase !== 'waiting') return;
    try {
      const delivery = await deps.deliver(current.session, openBrowser);
      if (current.generation === generation && state.phase === 'waiting') patch({ delivery });
    } catch {
      // 打不开浏览器或剪贴板不影响正在等待的授权，可继续手动打开链接。
      if (current.generation === generation && state.phase === 'waiting') patch({ delivery: 'failed' });
    }
  }

  async function finish(session: OAuthLoginSession, ticket: number) {
    try {
      const account = await deps.finish(session.flow_id);
      // 即便窗口已关闭，已经成功保存的账号也要反映到列表。
      deps.onSaved(account);
      if (ticket === generation) update({ ...initialState<T>(), phase: 'success', account });
    } catch (error) {
      if (ticket === generation) update({ ...initialState<T>(), phase: 'error', error: errorText(error) });
    } finally {
      if (owned?.generation === ticket) owned = undefined;
    }
  }

  function start(openBrowser: boolean): Promise<void> {
    if (['preparing', 'waiting', 'cancelling'].includes(state.phase)) return Promise.resolve();
    const ticket = ++generation;
    update({ ...initialState<T>(), phase: 'preparing' });
    // 串行准备与清理，防止关闭后立即重开时，迟到的 prepare 替换新会话。
    preparationQueue = preparationQueue.then(async () => {
      if (ticket !== generation) return;
      try {
        const session = await deps.prepare();
        if (ticket !== generation) {
          await deps.cancel(session.flow_id);
          return;
        }
        update({ ...initialState<T>(), phase: 'waiting', session, expiresAt: (deps.now?.() ?? Date.now()) + session.expires_in * 1000 });
        const completion = finish(session, ticket);
        owned = { generation: ticket, session, completion };
        void deliver(openBrowser);
      } catch (error) {
        if (ticket === generation) update({ ...initialState<T>(), phase: 'error', error: errorText(error) });
      }
    });
    return preparationQueue;
  }

  async function submit(code: string): Promise<boolean> {
    const current = owned;
    if (!current || state.phase !== 'waiting' || state.submitting || state.callbackSubmitted || !code.trim()) return false;
    patch({ submitting: true, error: undefined });
    try {
      await deps.submit(current.session.flow_id, code.trim());
      if (current.generation === generation && state.phase === 'waiting') patch({ submitting: false, callbackSubmitted: true });
      return true;
    } catch (error) {
      if (current.generation === generation && state.phase === 'waiting') patch({ submitting: false, error: errorText(error) });
      return false;
    }
  }

  async function cancel() {
    const current = owned;
    if (!current) {
      if (state.phase === 'preparing') {
        ++generation;
        update({ ...initialState<T>(), phase: 'cancelled' });
      }
      return;
    }
    patch({ phase: 'cancelling' });
    try {
      const cancelled = await deps.cancel(current.session.flow_id);
      if (current.generation !== generation) return;
      if (cancelled) {
        ++generation;
        owned = undefined;
        update({ ...initialState<T>(), phase: 'cancelled' });
      } else {
        // 保存已经提交时不能显示“已取消”，等同一个完成结果返回。
        await current.completion;
      }
    } catch (error) {
      if (current.generation === generation && owned === current) patch({ phase: 'waiting', error: errorText(error) });
    }
  }

  function dismiss() {
    const current = owned;
    ++generation;
    owned = undefined;
    update(initialState<T>());
    if (current) void deps.cancel(current.session.flow_id).catch(() => { /* 后端到期也会释放会话。 */ });
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start, submit, cancel, dismiss, deliver,
  };
}

// 借鉴 CC Switch 的本机浏览器偏好；不保存授权链接、回调或令牌。
const BROWSER_PREFERENCE_KEY = 'agyflux.oauth.openBrowser';
const LEGACY_BROWSER_PREFERENCE_KEY = 'antigravity-switch.oauth.openBrowser';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readOAuthBrowserPreference(storage?: PreferenceStorage): boolean {
  try {
    const preferences = storage ?? globalThis.localStorage;
    // 改名后读取旧偏好作为兜底，新写入统一使用 AgyFlux 的键名。
    return (preferences.getItem(BROWSER_PREFERENCE_KEY) ?? preferences.getItem(LEGACY_BROWSER_PREFERENCE_KEY)) !== 'false';
  }
  catch { return true; }
}

export function writeOAuthBrowserPreference(value: boolean, storage?: PreferenceStorage): void {
  try { (storage ?? globalThis.localStorage).setItem(BROWSER_PREFERENCE_KEY, String(value)); }
  catch { /* 禁用本机存储时仍允许本次登录。 */ }
}
