import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const pdfRecipeId = Number(process.env.TANDOOR_TEST_LOCAL_PDF_RECIPE_ID);
const jpegRecipeId = Number(process.env.TANDOOR_TEST_LOCAL_JPEG_RECIPE_ID);
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(REPO, 'test', 'e2e', 'fixtures', 'local-storage');
const PDF_FIXTURE = path.join(FIXTURES, 'e2e-local-pdf.pdf');
const JPEG_FIXTURE = path.join(FIXTURES, 'e2e-local-jpeg.jpg');

const decode = (data: string) => Buffer.from(data, 'base64');

(url && token && pdfRecipeId && jpegRecipeId ? describe : describe.skip)('file download tools against live Tandoor over stdio', () => {
  let mcp: Client;
  let downloadRoot: string;
  const call = async (name: string, args: Record<string, unknown>): Promise<any> => mcp.callTool({ name, arguments: args });

  beforeAll(async () => {
    downloadRoot = await mkdtemp(path.join(tmpdir(), 'tandoor-e2e-downloads-'));
    mcp = new Client({ name: 'e2e', version: 'e2e' });
    await mcp.connect(new StdioClientTransport({
      command: 'node',
      args: [path.join(REPO, 'build', 'index.js')],
      env: {
        ...process.env,
        TANDOOR_MCP_RECIPES: 'full',
        TANDOOR_MCP_ADMIN: 'on',
        TANDOOR_MCP_DOWNLOAD_ROOT: downloadRoot,
        TANDOOR_MCP_UPLOAD_ROOT: FIXTURES,
      } as Record<string, string>,
    }));
  });

  afterAll(async () => {
    await mcp.close();
    await rm(downloadRoot, { recursive: true });
  });

  it('returns the Local PDF recipe file as a resource block with the fixture bytes', async () => {
    const res = await call('download_recipe_file', { recipe_id: pdfRecipeId });
    const block = res.content.find((c: any) => c.type === 'resource');
    const bytes = decode(block.resource.blob);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.equals(await readFile(PDF_FIXTURE))).toBe(true);
  });

  it('returns the Local JPEG recipe file as an image block with the fixture bytes', async () => {
    const res = await call('download_recipe_file', { recipe_id: jpegRecipeId });
    const block = res.content.find((c: any) => c.type === 'image');
    expect(block.mimeType).toBe('image/jpeg');
    expect(decode(block.data).equals(await readFile(JPEG_FIXTURE))).toBe(true);
  });

  it('saves the PDF recipe file inside the download root', async () => {
    const res = await call('download_recipe_file', { recipe_id: pdfRecipeId, save: true });
    const saved = JSON.parse(res.content[0].text);
    expect(path.dirname(saved.path)).toBe(downloadRoot);
    expect((await readFile(saved.path)).equals(await readFile(PDF_FIXTURE))).toBe(true);
  });

  it('reports that a recipe without storage has no stored file', async () => {
    const recipe = await (await fetch(`${url}/api/recipe/`, {
      method: 'POST', headers, body: JSON.stringify({ name: `mcp-e2e-nofile-${Date.now()}`, steps: [] }),
    })).json();
    try {
      const res = await call('download_recipe_file', { recipe_id: recipe.id });
      expect(res).toMatchObject({
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining(`Recipe ${recipe.id} has no stored file; `) }],
      });
    } finally {
      await fetch(`${url}/api/recipe/${recipe.id}/`, { method: 'DELETE', headers });
    }
  });

  it('downloads an uploaded user file as an image block named after the user file', async () => {
    const upload = await call('upload_user_file', { name: 'e2e soup', file_path: JPEG_FIXTURE });
    const fileId = JSON.parse(upload.content[0].text.slice(upload.content[0].text.indexOf('{'))).id;
    try {
      const res = await call('download_file', { file_id: fileId });
      const block = res.content.find((c: any) => c.type === 'image');
      expect(decode(block.data).equals(await readFile(JPEG_FIXTURE))).toBe(true);
      expect(JSON.parse(res.content[0].text).filename).toBe('e2e soup.jpg');
    } finally {
      await fetch(`${url}/api/user-file/${fileId}/`, { method: 'DELETE', headers });
    }
  });

  it('reports a missing user file', async () => {
    const res = await call('download_file', { file_id: 999999 });
    expect(res).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: expect.stringContaining('Tandoor could not read user file 999999: ') }],
    });
  });

  it('returns an error for a Local recipe external link and keeps serving', async () => {
    const res = await call('get_external_recipe_file_link', { id: pdfRecipeId });
    expect(res.isError).toBe(true);
    const next = await call('download_recipe_file', { recipe_id: pdfRecipeId });
    expect(next.isError).toBeFalsy();
  });
});
