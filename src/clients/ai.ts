// AI provider + AI import API client.

import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class AiClient extends BaseClient {
  async listAiProviders(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/ai-provider/${qs(params)}`, { signal: opts?.signal });
  }

  async getAiProvider(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/ai-provider/${id}/`, { signal: opts?.signal });
  }

  async createAiProvider(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/ai-provider/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchAiProvider(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/ai-provider/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteAiProvider(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/ai-provider/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  async aiStepSort(body: { recipe: number }, opts?: Opts): Promise<any> {
    return this.request('/api/ai-step-sort/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  /**
   * AI-import a recipe from an uploaded file (image or PDF) and/or text via
   * Tandoor's configured AI provider. Returns a RecipeFromSourceResponse.
   */
  async aiImport(args: {
    ai_provider_id: number;
    file?: { data: Uint8Array | Buffer; filename: string; mimeType?: string };
    text?: string;
    recipe_id?: string | number;
  }, opts?: Opts): Promise<any> {
    const fd = new FormData();
    fd.append('ai_provider_id', String(args.ai_provider_id));
    fd.append('text', args.text ?? '');
    fd.append('recipe_id', args.recipe_id != null ? String(args.recipe_id) : '');
    if (args.file) {
      const blob = new Blob([new Uint8Array(args.file.data)], {
        type: args.file.mimeType || 'application/octet-stream',
      });
      fd.append('file', blob, args.file.filename);
    }
    return this.request('/api/ai-import/', {
      method: 'POST',
      body: fd,
      signal: opts?.signal,
    });
  }
}
