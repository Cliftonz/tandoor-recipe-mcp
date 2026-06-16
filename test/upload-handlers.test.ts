// File-upload coverage for upload_recipe_image.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleUploadRecipeImage } from '../src/handlers/recipe.js';
import { startStub, Stub } from './helpers/stub-http.js';
import { mockClient } from './helpers/mock-client.js';
import type { TandoorClient } from '../src/clients/index.js';

// Typed mock — misspelled client methods fail at typecheck.
const mock = (impl: Parameters<typeof mockClient<TandoorClient>>[0]) => mockClient<TandoorClient>(impl);

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(path.join(tmpdir(), 'upload-test-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

// Handler-boundary path-guard tests. These prove the handler calls
// assertSafeUploadPath BEFORE readFile AND uploadRecipeImage — a refactor
// that drops the guard from the handler would slip past path-guard's
// own unit tests (Codex F1 high).
describe('handler-boundary: upload_recipe_image refuses paths outside the allow-list', () => {
  let allowed: string;
  let outside: string;
  let prevRoot: string | undefined;

  beforeEach(() => {
    allowed = mkdtempSync(path.join(tmpdir(), 'allow-recipe-'));
    outside = mkdtempSync(path.join(tmpdir(), 'outside-recipe-'));
    prevRoot = process.env.TANDOOR_MCP_UPLOAD_ROOT;
    // Restrict allow-list to the freshly-minted `allowed` dir; anything in
    // `outside` is genuinely off-limits and reflects what an attacker would
    // attempt to exfil.
    process.env.TANDOOR_MCP_UPLOAD_ROOT = allowed;
  });
  afterEach(() => {
    rmSync(allowed, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.TANDOOR_MCP_UPLOAD_ROOT;
    else process.env.TANDOOR_MCP_UPLOAD_ROOT = prevRoot;
  });

  it('refuses a real file outside the allow-list and never calls Tandoor', async () => {
    const secret = path.join(outside, 'id_rsa');
    writeFileSync(secret, 'ssh-private-key-bytes');
    const upload = vi.fn();
    const client = mock({ recipes: { uploadRecipeImage: upload } });
    await expect(handleUploadRecipeImage(client, { id: 1, file_path: secret } as any))
      .rejects.toThrow(/outside the allowed upload roots/);
    expect(upload).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === 'win32')('refuses a symlink that points outside the allow-list', async () => {
    const secret = path.join(outside, 'aws-creds');
    writeFileSync(secret, '[default]\\naws_access_key_id=...');
    const trojan = path.join(allowed, 'innocent.png');
    symlinkSync(secret, trojan);
    const upload = vi.fn();
    const client = mock({ recipes: { uploadRecipeImage: upload } });
    await expect(handleUploadRecipeImage(client, { id: 1, file_path: trojan } as any))
      .rejects.toThrow(/outside the allowed upload roots/);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('handlers/recipe.ts upload_recipe_image branches', () => {
  it('throws when none of file_path / file_url / image_url provided', async () => {
    const client = mock({ recipes: { uploadRecipeImage: vi.fn() } });
    await expect(handleUploadRecipeImage(client, { id: 1 } as any))
      .rejects.toThrow(/file_path, file_url, image_url/);
  });

  it('image_url branch hands URL straight to Tandoor (no local fetch)', async () => {
    // image_url runs through assertPublicUrl strictly. example.test is RFC
    // 6761 reserved so the test-only env lets the URL through without
    // real DNS — production paths use real domains and skip this branch.
    process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK = '1';
    try {
      const upload = vi.fn().mockResolvedValue({ id: 1, image: '/p/1.png' });
      const client = mock({ recipes: { uploadRecipeImage: upload } });
      const r = await handleUploadRecipeImage(client, {
        id: 1, image_url: 'https://example.test/p/1.png',
      } as any);
      expect(upload).toHaveBeenCalledWith(1, { image_url: 'https://example.test/p/1.png' });
      expect(r).toMatch(/Image set from URL/);
    } finally {
      delete process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK;
    }
  });

  it('file_path branch reads bytes + correct MIME from extension', async () => {
    const filePath = path.join(tmp, 'hero.jpg');
    writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    const upload = vi.fn().mockResolvedValue({ id: 1 });
    const client = mock({ recipes: { uploadRecipeImage: upload } });
    await handleUploadRecipeImage(client, { id: 1, file_path: filePath } as any);
    const args = upload.mock.calls[0][1];
    expect(args.file.mimeType).toBe('image/jpeg');
    expect(args.file.filename).toBe('hero.jpg');
    expect(args.file.data).toBeInstanceOf(Buffer);
    expect(args.file.data.length).toBe(4);
  });

  it('file_path with unknown extension falls back to application/octet-stream', async () => {
    // Pinning the contract: unknown extensions get octet-stream.
    const filePath = path.join(tmp, 'mystery.xyz');
    writeFileSync(filePath, 'fake');
    const upload = vi.fn().mockResolvedValue({ id: 1 });
    const client = mock({ recipes: { uploadRecipeImage: upload } });
    await handleUploadRecipeImage(client, { id: 1, file_path: filePath } as any);
    expect(upload.mock.calls[0][1].file.mimeType).toBe('application/octet-stream');
  });

  describe('file_url branch', () => {
    let stub: Stub;
    let url = '';
    let mode: 'ok-png' | 'ok-no-ct' | 'fail' = 'ok-png';

    // Test stubs bind 127.0.0.1, which the SSRF guard refuses by default.
    // Opt out for the duration of these tests — the real behavior is
    // covered by test/safe-fetch.test.ts.
    beforeEach(() => { process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1'; });
    afterEach(() => { delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH; });

    beforeEach(async () => {
      stub = await startStub((_req, res) => {
        switch (mode) {
          case 'fail':
            res.statusCode = 502;
            return res.end('bad gateway');
          case 'ok-no-ct':
            res.setHeader('content-type', 'application/octet-stream');
            return res.end(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
          default:
            res.setHeader('content-type', 'image/png');
            return res.end(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
        }
      });
      url = stub.url;
    });

    afterEach(async () => {
      await stub.close();
    });

    it('fetches bytes and forwards with Content-Type-derived MIME', async () => {
      mode = 'ok-png';
      const upload = vi.fn().mockResolvedValue({ id: 1 });
      const client = mock({ recipes: { uploadRecipeImage: upload } });
      await handleUploadRecipeImage(client, { id: 1, file_url: `${url}/photo.png` } as any);
      const args = upload.mock.calls[0][1];
      expect(args.file.mimeType).toBe('image/png');
      expect(args.file.filename).toBe('photo.png');
      expect(args.file.data.length).toBe(4);
    });

    it('upstream 502 surfaces as a clear error before any Tandoor write', async () => {
      mode = 'fail';
      const upload = vi.fn();
      const client = mock({ recipes: { uploadRecipeImage: upload } });
      await expect(
        handleUploadRecipeImage(client, { id: 1, file_url: `${url}/photo.png` } as any),
      ).rejects.toThrow(/502/);
      expect(upload).not.toHaveBeenCalled();
    });

    it('URL without filename component falls back to "image"', async () => {
      mode = 'ok-png';
      const upload = vi.fn().mockResolvedValue({ id: 1 });
      const client = mock({ recipes: { uploadRecipeImage: upload } });
      await handleUploadRecipeImage(client, { id: 1, file_url: `${url}/` } as any);
      expect(upload.mock.calls[0][1].file.filename).toBe('image');
    });
  });

  // Handler-boundary SSRF tests with opt-out UNSET. Catches a regression
  // where safeFetchBytes is swapped for raw fetch on the file_url branch
  // (Codex F6).
  describe('refuses SSRF-targeted file_url', () => {
    let prev: string | undefined;
    beforeEach(() => {
      prev = process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
    });
    afterEach(() => {
      if (prev !== undefined) process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = prev;
    });

    it('loopback file_url → SsrfBlockedError; no Tandoor call', async () => {
      const upload = vi.fn();
      const client = mock({ recipes: { uploadRecipeImage: upload } });
      await expect(handleUploadRecipeImage(client, {
        id: 1, file_url: 'http://127.0.0.1/x.png',
      } as any)).rejects.toThrow(/SSRF guard blocked/);
      expect(upload).not.toHaveBeenCalled();
    });

    it('IMDS file_url → SsrfBlockedError; no Tandoor call', async () => {
      const upload = vi.fn();
      const client = mock({ recipes: { uploadRecipeImage: upload } });
      await expect(handleUploadRecipeImage(client, {
        id: 1, file_url: 'http://169.254.169.254/cred.png',
      } as any)).rejects.toThrow(/SSRF guard blocked/);
      expect(upload).not.toHaveBeenCalled();
    });
  });
});
