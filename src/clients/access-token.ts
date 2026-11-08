import { BaseClient, TandoorApiError, hasTandoorStatus, qs } from './base.js';

type Opts = { signal?: AbortSignal };

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export class AccessTokenClient extends BaseClient {
  async listTokens(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/access-token/${qs(params)}`, { signal: opts?.signal });
  }

  async getToken(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/access-token/${id}/`, { signal: opts?.signal });
  }

  async createToken(body: { scope: string; expires: string }, opts?: Opts): Promise<any> {
    return this.request('/api/access-token/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchToken(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/access-token/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteToken(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/access-token/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  async authenticate(body: { username: string; password: string }, opts?: Opts): Promise<any> {
    try {
      return await this.request('/api-token-auth/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal, redirect: 'manual' });
    } catch (e) {
      if (!(e instanceof TandoorApiError && e.location?.startsWith('/account/login'))) throw e;
    }
    const login = await this.request<{ meta: { session_token: string } }>('/_allauth/app/v1/auth/login', {
      method: 'POST', body: JSON.stringify(body), signal: opts?.signal,
    }).catch((e: Error) => {
      if (!hasTandoorStatus(e, 401)) throw e;
      throw new Error('This account needs an extra login step (MFA or email verification). Create a token in Tandoor under Settings > API.', { cause: e });
    });
    const expires = new Date(Date.now() + ONE_YEAR_MS).toISOString();
    return this.request('/api/access-token/', {
      method: 'POST', body: JSON.stringify({ scope: 'read write', expires }), signal: opts?.signal, sessionToken: login.meta.session_token,
    });
  }
}
