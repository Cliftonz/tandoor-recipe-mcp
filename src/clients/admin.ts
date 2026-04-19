// Share links, user prefs, automations, user-files, activity logs.

import { BaseClient } from './base.js';

function qs(params?: Record<string, any>): string {
  const sp = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) sp.append(k, String(v));
    });
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export class ShareLinkClient extends BaseClient {
  /** Retrieve an existing share link by id (create/list/delete not exposed in REST API). */
  async getShareLink(id: number): Promise<any> {
    return this.request(`/api/share-link/${id}`);
  }

  /**
   * Build a URL usable to view a shared recipe. Client-side helper — does not
   * hit the API. Tandoor shared recipes use GET /api/recipe/{id}/?share=<uuid>.
   */
  sharedRecipeUrl(baseUrl: string, recipeId: number, shareUuid: string): string {
    return `${baseUrl.replace(/\/$/, '')}/api/recipe/${recipeId}/?share=${shareUuid}`;
  }
}

export class UserPreferenceClient extends BaseClient {
  async listPreferences(): Promise<any> { return this.request('/api/user-preference/'); }
  async getPreference(userId: number): Promise<any> { return this.request(`/api/user-preference/${userId}/`); }
  async patchPreference(userId: number, body: any): Promise<any> {
    return this.request(`/api/user-preference/${userId}/`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }
}

export class AutomationClient extends BaseClient {
  async listAutomations(params?: { page?: number; page_size?: number }): Promise<any> {
    return this.request(`/api/automation/${qs(params)}`);
  }
  async getAutomation(id: number): Promise<any> { return this.request(`/api/automation/${id}/`); }
  async createAutomation(body: any): Promise<any> {
    return this.request('/api/automation/', { method: 'POST', body: JSON.stringify(body) });
  }
  async patchAutomation(id: number, body: any): Promise<any> {
    return this.request(`/api/automation/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  async deleteAutomation(id: number): Promise<void> {
    return this.request(`/api/automation/${id}/`, { method: 'DELETE' });
  }
}

export class UserFileClient extends BaseClient {
  async listUserFiles(params?: { page?: number; page_size?: number; query?: string }): Promise<any> {
    return this.request(`/api/user-file/${qs(params)}`);
  }
  async getUserFile(id: number): Promise<any> { return this.request(`/api/user-file/${id}/`); }

  /** Upload a file (multipart). */
  async createUserFile(args: { name: string; file: { data: Uint8Array | Buffer; filename: string; mimeType?: string } }): Promise<any> {
    const fd = new FormData();
    fd.append('name', args.name);
    const blob = new Blob([new Uint8Array(args.file.data)], {
      type: args.file.mimeType || 'application/octet-stream',
    });
    fd.append('file', blob, args.file.filename);
    return this.request('/api/user-file/', { method: 'POST', body: fd });
  }

  async patchUserFile(id: number, body: any): Promise<any> {
    return this.request(`/api/user-file/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteUserFile(id: number): Promise<void> {
    return this.request(`/api/user-file/${id}/`, { method: 'DELETE' });
  }
}

export class ServerSettingsClient extends BaseClient {
  async getCurrent(): Promise<any> {
    return this.request('/api/server-settings/current/');
  }
}

export class LogClient extends BaseClient {
  async listViewLogs(params?: { page?: number; page_size?: number }): Promise<any> {
    return this.request(`/api/view-log/${qs(params)}`);
  }
  async listImportLogs(params?: { page?: number; page_size?: number }): Promise<any> {
    return this.request(`/api/import-log/${qs(params)}`);
  }
  async listAiLogs(params?: { page?: number; page_size?: number }): Promise<any> {
    return this.request(`/api/ai-log/${qs(params)}`);
  }
}
