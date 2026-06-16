// Contract tests for the AI import handler.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  handleListAiProviders,
  handleAiImportRecipe,
} from '../src/handlers/ai.js';
import { startStub } from './helpers/stub-http.js';
import { paginated } from './helpers/factories.js';
import { mockClient } from './helpers/mock-client.js';
import type { TandoorClient } from '../src/clients/index.js';

// Typed mock — misspelled client methods fail at typecheck.
const mock = (impl: Parameters<typeof mockClient<TandoorClient>>[0]) => mockClient<TandoorClient>(impl);

describe('handlers/ai.ts', () => {
  describe('list_ai_providers', () => {
    it('slim form drops sensitive provider config', async () => {
      const client = mock({
        ai: {
          listAiProviders: async () => paginated([{
            id: 1, name: 'openai', ai_model_type: 'openai',
            api_key: 'sk-SECRET', endpoint: 'https://secret.test',
          }]),
        },
      });
      const res = await handleListAiProviders(client, {} as any);
      const parsed = JSON.parse(res);
      const provider = parsed.results[0];
      expect(provider).toEqual({ id: 1, name: 'openai', ai_model_type: 'openai' });
      expect(provider).not.toHaveProperty('api_key');
      expect(provider).not.toHaveProperty('endpoint');
    });

    it('format=full keeps raw response (including api_key)', async () => {
      const raw = paginated([{ id: 1, name: 'openai', api_key: 'sk-x' }]);
      const client = mock({ ai: { listAiProviders: async () => raw } });
      const res = await handleListAiProviders(client, { format: 'full' } as any);
      expect(JSON.parse(res)).toEqual(raw);
    });
  });

  describe('ai_import_recipe input validation', () => {
    it('throws when none of file_path / file_url / text provided', async () => {
      const client = mock({ ai: { listAiProviders: vi.fn(), aiImport: vi.fn() } });
      await expect(handleAiImportRecipe(client, {} as any))
        .rejects.toThrow(/file_path, file_url, text/);
    });
  });

  describe('provider auto-pick', () => {
    it('uses explicit ai_provider_id without listing', async () => {
      const list = vi.fn();
      const aiImport = vi.fn().mockResolvedValue({ recipe: null, msg: 'not enough info' });
      const client = mock({ ai: { listAiProviders: list, aiImport } });
      await handleAiImportRecipe(client, {
        text: 'do not save',
        ai_provider_id: 7,
        save: false,
      } as any);
      expect(list).not.toHaveBeenCalled();
      expect(aiImport).toHaveBeenCalledWith(expect.objectContaining({ ai_provider_id: 7 }));
    });

    it('lists and picks the first provider when ai_provider_id omitted', async () => {
      const list = vi.fn().mockResolvedValue(
        paginated([{ id: 9, name: 'openai' }, { id: 11, name: 'anthropic' }]),
      );
      const aiImport = vi.fn().mockResolvedValue({ recipe: null });
      const client = mock({ ai: { listAiProviders: list, aiImport } });
      await handleAiImportRecipe(client, { text: 't', save: false } as any);
      expect(list).toHaveBeenCalledWith({ page_size: 1 });
      expect(aiImport).toHaveBeenCalledWith(expect.objectContaining({ ai_provider_id: 9 }));
    });

    it('zero providers → actionable error mentioning list_ai_providers', async () => {
      const client = mock({
        ai: {
          listAiProviders: async () => paginated([]),
          aiImport: vi.fn(),
        },
      });
      await expect(handleAiImportRecipe(client, { text: 't' } as any))
        .rejects.toThrow(/list_ai_providers/);
    });
  });

  describe('input branches reach aiImport', () => {
    it('text input is forwarded verbatim', async () => {
      const aiImport = vi.fn().mockResolvedValue({ recipe: null });
      const client = mock({ ai: { listAiProviders: vi.fn(), aiImport } });
      await handleAiImportRecipe(client, {
        text: 'recipe: 1 egg, 1 toast',
        ai_provider_id: 1, save: false,
      } as any);
      expect(aiImport).toHaveBeenCalledWith(expect.objectContaining({
        text: 'recipe: 1 egg, 1 toast',
      }));
    });

    it('file_path is read as bytes with MIME guessed from extension', async () => {
      const tmp = mkdtempSync(path.join(tmpdir(), 'ai-test-'));
      try {
        const fp = path.join(tmp, 'menu.pdf');
        writeFileSync(fp, Buffer.from('%PDF-1.4'));
        const aiImport = vi.fn().mockResolvedValue({ recipe: null });
        const client = mock({ ai: { listAiProviders: vi.fn(), aiImport } });
        await handleAiImportRecipe(client, {
          file_path: fp, ai_provider_id: 1, save: false,
        } as any);
        const call = aiImport.mock.calls[0][0];
        expect(call.file.mimeType).toBe('application/pdf');
        expect(call.file.filename).toBe('menu.pdf');
        expect(call.file.data).toBeInstanceOf(Buffer);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('file_url fetch failure surfaces 5xx before any AI call', async () => {
      const stub = await startStub((_req, res) => {
        res.statusCode = 503;
        res.end('down');
      });
      // Test stub binds 127.0.0.1; opt out of the SSRF guard locally.
      process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
      try {
        const aiImport = vi.fn();
        const client = mock({ ai: { listAiProviders: vi.fn(), aiImport } });
        await expect(handleAiImportRecipe(client, {
          file_url: `${stub.url}/menu.jpg`, ai_provider_id: 1,
        } as any)).rejects.toThrow(/503/);
        expect(aiImport).not.toHaveBeenCalled();
      } finally {
        delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
        await stub.close();
      }
    });
  });

  describe('post-aiImport flow', () => {
    it('save=false returns raw aiImport response without scraping', async () => {
      const raw = { recipe: { name: 'x' }, msg: 'ok' };
      const client = mock({
        ai: { listAiProviders: vi.fn(), aiImport: async () => raw },
      });
      const res = await handleAiImportRecipe(client, {
        text: 't', ai_provider_id: 1, save: false,
      } as any);
      expect(JSON.parse(res)).toEqual(raw);
    });

    it('unusable scrape surfaces Tandoor msg + raw response, does NOT save', async () => {
      const aiImport = async () => ({ recipe: null, msg: 'image was unreadable' });
      const client = mock({ ai: { listAiProviders: vi.fn(), aiImport } });
      const res = await handleAiImportRecipe(client, {
        text: 't', ai_provider_id: 1,
      } as any);
      expect(res).toMatch(/did not return a usable recipe/);
      expect(res).toMatch(/image was unreadable/);
    });
  });

  // Handler-boundary path-guard tests (Codex high). Proves the handler
  // calls assertSafeUploadPath BEFORE readFile + aiImport.
  describe('file_path refuses paths outside the allow-list', () => {
    let allowed: string;
    let outside: string;
    let prevRoot: string | undefined;

    beforeEach(() => {
      allowed = mkdtempSync(path.join(tmpdir(), 'allow-ai-'));
      outside = mkdtempSync(path.join(tmpdir(), 'outside-ai-'));
      prevRoot = process.env.TANDOOR_MCP_UPLOAD_ROOT;
      process.env.TANDOOR_MCP_UPLOAD_ROOT = allowed;
    });
    afterEach(() => {
      rmSync(allowed, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
      if (prevRoot === undefined) delete process.env.TANDOOR_MCP_UPLOAD_ROOT;
      else process.env.TANDOOR_MCP_UPLOAD_ROOT = prevRoot;
    });

    it('refuses an out-of-root file and never calls aiImport', async () => {
      const secret = path.join(outside, 'gpg-key');
      writeFileSync(secret, 'BEGIN PGP PRIVATE KEY BLOCK');
      const aiImport = vi.fn();
      const client = mock({ ai: { listAiProviders: vi.fn(), aiImport } });
      await expect(handleAiImportRecipe(client, {
        file_path: secret, ai_provider_id: 1, save: false,
      } as any)).rejects.toThrow(/outside the allowed upload roots/);
      expect(aiImport).not.toHaveBeenCalled();
    });

    it.skipIf(process.platform === 'win32')('refuses a symlink in-root pointing out-of-root', async () => {
      const secret = path.join(outside, 'env');
      writeFileSync(secret, 'OPENAI_API_KEY=sk-XYZ');
      const trojan = path.join(allowed, 'menu.pdf');
      symlinkSync(secret, trojan);
      const aiImport = vi.fn();
      const client = mock({ ai: { listAiProviders: vi.fn(), aiImport } });
      await expect(handleAiImportRecipe(client, {
        file_path: trojan, ai_provider_id: 1, save: false,
      } as any)).rejects.toThrow(/outside the allowed upload roots/);
      expect(aiImport).not.toHaveBeenCalled();
    });
  });
});
