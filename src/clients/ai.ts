// AI provider + AI import API client.

import { BaseClient } from './base.js';

export class AiClient extends BaseClient {
  async listAiProviders(params?: { page?: number; page_size?: number }): Promise<any> {
    const sp = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) sp.append(k, String(v));
      });
    }
    const qs = sp.toString();
    return this.request(`/api/ai-provider/${qs ? `?${qs}` : ''}`);
  }

  async getAiProvider(id: number): Promise<any> {
    return this.request(`/api/ai-provider/${id}/`);
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
  }): Promise<any> {
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
    });
  }
}
