import { afterEach, describe, expect, it, vi } from 'vitest';
import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core';
import { api, clearSession, storeSession } from '@/lib/api';

const response = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe('session renewal', () => {
  it('renews once for concurrent expired requests and preserves the company and app headers', async () => {
    storeSession('old', 'refresh');
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/auth/refresh') return response(200, { token: 'renewed' });
      const headers = init.headers as Record<string, string>;
      expect(headers['X-App-Key']).toBe('zenit-bizz');
      expect(headers['X-Company-Id']).toBe('23');
      return headers.Authorization === 'Bearer old' ? response(401, {}) : response(200, { ok: true });
    });
    vi.stubGlobal('fetch', fetcher);
    expect(
      await Promise.all([api('/bizz/contacts', { companyId: 23 }), api('/bizz/contacts', { companyId: 23 })])
    ).toEqual([{ ok: true }, { ok: true }]);
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1);
  });

  it('does not restore a logged-out session when an old refresh completes', async () => {
    storeSession('old', 'refresh');
    let complete!: (result: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      complete = resolve;
    });
    const fetcher = vi.fn().mockResolvedValueOnce(response(401, {})).mockReturnValueOnce(pending);
    vi.stubGlobal('fetch', fetcher);
    const request = api('/auth/me').catch((error) => error);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    clearSession();
    complete(response(200, { token: 'stale' }));
    expect(await request).toMatchObject({ status: 401 });
    expect(localStorage.getItem(SSO_STORAGE_KEYS.token)).toBeNull();
  });

  it('does not erase a new login when an earlier request returns unauthorized', async () => {
    storeSession('old', 'refresh');
    let complete!: (result: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          })
      )
    );
    const request = api('/auth/me').catch((error) => error);
    clearSession();
    storeSession('new-login', 'new-refresh');
    complete(response(401, {}));
    expect(await request).toMatchObject({ status: 401 });
    expect(localStorage.getItem(SSO_STORAGE_KEYS.token)).toBe('new-login');
  });
});
