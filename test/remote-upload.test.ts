import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRecipeTools } from '../src/tools/recipe.js';
import { registerAdminTools } from '../src/tools/admin.js';
import { registerAiTools } from '../src/tools/ai.js';
import { _resetRegisteredNames, getGuardRejectionStats } from '../src/lib/register.js';
import { _resetPathGuardCache } from '../src/lib/path-guard.js';
import { invokeTool } from './helpers/mcp.js';
import { startStub, Stub } from './helpers/stub-http.js';
import { mockClient } from './helpers/mock-client.js';
import type { TandoorClient } from '../src/clients/index.js';

const ENV_VARS = ['TANDOOR_MCP_TRANSPORT', 'TANDOOR_MCP_PUBLIC_URL', 'TANDOOR_MCP_UPLOAD_ROOT', 'TANDOOR_MCP_ALLOW_PRIVATE_FETCH'];
const REMOTE_REFUSAL = 'Error: file_path is not available on a remote server; use file_url instead.';
const SECRET = 'bytes-that-must-never-leave-the-server';

interface UploadTool {
  name: string;
  args: Record<string, unknown>;
  build: (upload: ReturnType<typeof vi.fn>) => TandoorClient;
  uploadedBytes: (upload: ReturnType<typeof vi.fn>) => Buffer;
}

const TOOLS: UploadTool[] = [
  {
    name: 'upload_recipe_image',
    args: { id: 1 },
    build: (upload) => mockClient<TandoorClient>({ recipes: { uploadRecipeImage: upload } }),
    uploadedBytes: (upload) => upload.mock.calls[0][1].file.data,
  },
  {
    name: 'upload_user_file',
    args: { name: 'photo' },
    build: (upload) => mockClient<TandoorClient>({ userFiles: { createUserFile: upload } }),
    uploadedBytes: (upload) => upload.mock.calls[0][0].file.data,
  },
  {
    name: 'import_recipe_from_image',
    args: { ai_provider_id: 1, save: false },
    build: (upload) => mockClient<TandoorClient>({ ai: { aiImport: upload } }),
    uploadedBytes: (upload) => upload.mock.calls[0][0].file.data,
  },
];

function serverWith(client: TandoorClient): McpServer {
  _resetRegisteredNames();
  const server = new McpServer({ name: 'test', version: 'test' });
  registerRecipeTools(server, client);
  registerAdminTools(server, client);
  registerAiTools(server, client);
  return server;
}

const saved: Record<string, string | undefined> = {};
let root: string;
let file: string;

beforeEach(() => {
  for (const name of ENV_VARS) saved[name] = process.env[name];
  root = mkdtempSync(path.join(tmpdir(), 'remote-upload-'));
  file = path.join(root, 'photo.png');
  writeFileSync(file, SECRET);
  process.env.TANDOOR_MCP_UPLOAD_ROOT = root;
  _resetPathGuardCache();
});

afterEach(() => {
  for (const name of ENV_VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  rmSync(root, { recursive: true, force: true });
  _resetPathGuardCache();
});

describe.each(TOOLS)('$name', (tool) => {
  describe('in remote mode', () => {
    beforeEach(() => {
      process.env.TANDOOR_MCP_TRANSPORT = 'http';
      process.env.TANDOOR_MCP_PUBLIC_URL = 'https://mcp.example.com/mcp';
    });

    it('refuses a readable file_path inside an allowed root and uploads nothing', async () => {
      const upload = vi.fn().mockResolvedValue({ id: 1 });
      const result = await invokeTool(serverWith(tool.build(upload)), tool.name, { ...tool.args, file_path: file });
      expect(result).toEqual({ content: [{ type: 'text', text: REMOTE_REFUSAL }], isError: true });
      expect(upload).not.toHaveBeenCalled();
    });

    it('treats the refusal as a usage error: no guard-rejection count and no guard-rejection log line', async () => {
      const upload = vi.fn().mockResolvedValue({ id: 1 });
      const server = serverWith(tool.build(upload));
      const before = getGuardRejectionStats();
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await invokeTool(server, tool.name, { ...tool.args, file_path: file });
        expect(stderr.mock.calls.flat().join('\n')).not.toContain('guard rejection');
      } finally {
        stderr.mockRestore();
      }
      expect(getGuardRejectionStats()).toEqual(before);
    });

    it('refuses a file_path that does not exist with the same error, without resolving it', async () => {
      const upload = vi.fn().mockResolvedValue({ id: 1 });
      const missing = path.join(root, 'missing.png');
      const result = await invokeTool(serverWith(tool.build(upload)), tool.name, { ...tool.args, file_path: missing });
      expect(result).toEqual({ content: [{ type: 'text', text: REMOTE_REFUSAL }], isError: true });
    });

    describe('file_url', () => {
      let stub: Stub;
      beforeEach(async () => {
        process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = '1';
        stub = await startStub((_req, res) => {
          res.setHeader('content-type', 'image/png');
          res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        });
      });
      afterEach(async () => { await stub.close(); });

      it('still uploads the fetched bytes', async () => {
        const upload = vi.fn().mockResolvedValue({ id: 1 });
        const result = await invokeTool(serverWith(tool.build(upload)), tool.name, { ...tool.args, file_url: `${stub.url}/photo.png` });
        expect(result.isError).toBeUndefined();
        expect(tool.uploadedBytes(upload)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      });
    });
  });

  describe('outside remote mode', () => {
    beforeEach(() => { delete process.env.TANDOOR_MCP_PUBLIC_URL; });

    it('uploads the file_path bytes', async () => {
      const upload = vi.fn().mockResolvedValue({ id: 1 });
      const result = await invokeTool(serverWith(tool.build(upload)), tool.name, { ...tool.args, file_path: file });
      expect(result.isError).toBeUndefined();
      expect(tool.uploadedBytes(upload).toString()).toBe(SECRET);
    });
  });
});
