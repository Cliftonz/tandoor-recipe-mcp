// Tests for AiProvider CRUD handlers and ai_step_sort.
// AiProvider.api_key is a real credential; slim mode MUST redact it.

import { describe, it, expect, vi } from 'vitest';
import {
  handleGetAiProvider,
  handleCreateAiProvider,
  handleUpdateAiProvider,
  handleDeleteAiProvider,
  handleAiStepSort,
  handleListAiProviders,
  __test__ as aiInternals,
} from '../src/handlers/ai.js';
import { mockClient } from './helpers/mock-client.js';
import type { TandoorClient } from '../src/clients/index.js';
import { createAiProviderShape, updateAiProviderShape } from '../src/tools/ai.js';

const mock = (impl: Parameters<typeof mockClient<TandoorClient>>[0]) =>
  mockClient<TandoorClient>(impl);

const fullProvider = {
  id: 5,
  name: 'openai-main',
  api_key: 'sk-SECRET',
  endpoint: 'https://api.openai.com',
  model_name: 'gpt-4',
  provider: 'openai',
  created_by: 1,
};

describe('AiProvider shape uses model_name (matches Tandoor OpenAPI 2.3.6)', () => {
  it('createAiProviderShape has model_name, not model', () => {
    expect(createAiProviderShape).toHaveProperty('model_name');
    expect(createAiProviderShape).not.toHaveProperty('model');
  });
  it('updateAiProviderShape has model_name, not model', () => {
    expect(updateAiProviderShape).toHaveProperty('model_name');
    expect(updateAiProviderShape).not.toHaveProperty('model');
  });
});

describe('slimAiProvider', () => {
  it('strips api_key', () => {
    const out = aiInternals.slimAiProvider(fullProvider);
    expect(out).not.toHaveProperty('api_key');
    expect(out).toEqual({
      id: 5,
      name: 'openai-main',
      endpoint: 'https://api.openai.com',
      model_name: 'gpt-4',
      provider: 'openai',
    });
  });

  it('passes through null/undefined', () => {
    expect(aiInternals.slimAiProvider(null)).toBeNull();
    expect(aiInternals.slimAiProvider(undefined)).toBeUndefined();
  });
});

describe('get_ai_provider', () => {
  it('slim (default) redacts api_key', async () => {
    const client = mock({
      ai: { getAiProvider: async () => fullProvider },
    });
    const res = await handleGetAiProvider(client, { id: 5 } as any);
    const parsed = JSON.parse(res);
    expect(parsed).not.toHaveProperty('api_key');
    expect(parsed.id).toBe(5);
  });

  it('format=full returns raw with api_key', async () => {
    const client = mock({
      ai: { getAiProvider: async () => fullProvider },
    });
    const res = await handleGetAiProvider(client, { id: 5, format: 'full' } as any);
    expect(JSON.parse(res)).toEqual(fullProvider);
  });
});

describe('create_ai_provider', () => {
  it('POSTs name/api_key/model_name and returns slim by default', async () => {
    const create = vi.fn().mockResolvedValue(fullProvider);
    const client = mock({ ai: { createAiProvider: create } });
    const res = await handleCreateAiProvider(client, {
      name: 'openai-main',
      api_key: 'sk-SECRET',
      model_name: 'gpt-4',
      provider: 'openai',
      endpoint: 'https://api.openai.com',
    } as any);
    expect(create).toHaveBeenCalledWith({
      name: 'openai-main',
      api_key: 'sk-SECRET',
      model_name: 'gpt-4',
      provider: 'openai',
      endpoint: 'https://api.openai.com',
    }, { signal: undefined });
    expect(res).toMatch(/created/i);
    expect(res).not.toMatch(/sk-SECRET/);
  });
});

describe('update_ai_provider', () => {
  it('throws on empty body', async () => {
    const patch = vi.fn();
    const client = mock({ ai: { patchAiProvider: patch } });
    await expect(
      handleUpdateAiProvider(client, { id: 5 } as any),
    ).rejects.toThrow(/at least one field/i);
    expect(patch).not.toHaveBeenCalled();
  });

  it('PATCHes provided fields and returns slim (no api_key leak)', async () => {
    const patch = vi.fn(async (_id: number, body: any) => ({
      id: 5,
      name: 'openai-main',
      endpoint: 'https://api.openai.com',
      model_name: 'gpt-4',
      provider: 'openai',
      api_key: body.api_key ?? 'sk-SECRET',
    }));
    const client = mock({ ai: { patchAiProvider: patch } });
    const res = await handleUpdateAiProvider(client, {
      id: 5,
      api_key: 'sk-NEW',
    } as any);
    expect(patch).toHaveBeenCalledWith(5, { api_key: 'sk-NEW' }, { signal: undefined });
    expect(res).not.toMatch(/sk-SECRET/);
    expect(res).not.toMatch(/sk-NEW/);
  });
});

describe('handleListAiProviders', () => {
  const raw = {
    id: 7,
    name: 'openai-main',
    ai_model_type: 'text',
    api_key: 'sk-SECRET',
    endpoint: 'https://api.openai.com',
    model_name: 'gpt-4',
    provider: 'openai',
  };

  it('slim strips api_key and surfaces only id/name/ai_model_type', async () => {
    const list = vi.fn(async () => ({ count: 1, next: null, previous: null, results: [raw] }));
    const client = mock({ ai: { listAiProviders: list } });
    const res = await handleListAiProviders(client, {} as any);
    const parsed = JSON.parse(res);
    expect(parsed.results[0]).toEqual({ id: 7, name: 'openai-main', ai_model_type: 'text' });
    expect(res).not.toMatch(/sk-SECRET/);
  });

  it('format=full preserves api_key verbatim', async () => {
    const list = vi.fn(async () => ({ count: 1, next: null, previous: null, results: [raw] }));
    const client = mock({ ai: { listAiProviders: list } });
    const res = await handleListAiProviders(client, { format: 'full' } as any);
    expect(res).toContain('sk-SECRET');
    expect(JSON.parse(res).results[0].api_key).toBe('sk-SECRET');
  });

  it('forwards page and page_size params to the client', async () => {
    const list = vi.fn(async () => ({ count: 0, next: null, previous: null, results: [] }));
    const client = mock({ ai: { listAiProviders: list } });
    await handleListAiProviders(client, { page: 2, page_size: 25 } as any);
    expect(list).toHaveBeenCalledWith({ page: 2, page_size: 25 }, { signal: undefined });
  });
});

describe('delete_ai_provider', () => {
  it('calls delete and confirms', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const client = mock({ ai: { deleteAiProvider: del } });
    const res = await handleDeleteAiProvider(client, { id: 5 } as any);
    expect(del).toHaveBeenCalledWith(5, { signal: undefined });
    expect(res).toMatch(/5/);
    expect(res).toMatch(/deleted/i);
  });
});

describe('ai_step_sort', () => {
  it('POSTs { recipe: id } and returns response', async () => {
    const sort = vi.fn().mockResolvedValue({ id: 42, name: 'sorted' });
    const client = mock({ ai: { aiStepSort: sort } });
    const res = await handleAiStepSort(client, { recipe_id: 42 } as any);
    expect(sort).toHaveBeenCalledWith({ recipe: 42 }, { signal: undefined });
    expect(JSON.parse(res)).toEqual({ id: 42, name: 'sorted' });
  });
});
