import { isTauri as checkTauri } from './env';
import { previewMockRequest } from './previewMock';

export async function request<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!checkTauri()) {
    return previewMockRequest<T>(cmd, args);
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch (error) {
    console.error(`Tauri Invoke Error [${cmd}]:`, error);
    throw error;
  }
}
