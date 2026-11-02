import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import type http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerHousekeepingTools } from '../src/tools/housekeeping.js';
import { INLINE_CAP_BYTES } from '../src/lib/download.js';
import { startStub, type Stub } from './helpers/stub-http.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PDF = Buffer.from('%PDF-1.4\n%fake pdf body\n');

describe('download_recipe_file over MCP', () => {
  let stub: Stub;
  let server: McpServer;
  let mcp: Client;
  let requestedPath: string | undefined;
  let body: Buffer;
  let disposition: string | undefined;
  let respond: ((res: http.ServerResponse) => void) | undefined;

  beforeAll(async () => {
    stub = await startStub((req, res) => {
      requestedPath = req.url;
      res.setHeader('content-type', 'application/octet-stream');
      if (disposition !== undefined) res.setHeader('content-disposition', disposition);
      if (respond) return respond(res);
      res.setHeader('content-length', String(body.length));
      res.end(body);
    });
    server = new McpServer({ name: 'test', version: 'test' });
    registerHousekeepingTools(server, new TandoorClient({ url: stub.url, token: 'tok-test' }));
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    mcp = new Client({ name: 'test-client', version: 'test' });
    await mcp.connect(clientT);
  });

  afterAll(async () => {
    await mcp.close();
    await server.close();
    await stub.close();
  });

  beforeEach(() => { respond = undefined; });

  const call = async (args: Record<string, unknown>): Promise<any> =>
    mcp.callTool({ name: 'download_recipe_file', arguments: args });

  it('returns a JPEG named .pdf as an image block', async () => {
    body = JPEG;
    disposition = 'inline; filename="Pasta.pdf"';
    const r = await call({ recipe_id: 7 });
    expect(requestedPath).toBe('/api/get_recipe_file/7/');
    expect(r.isError).toBeFalsy();
    expect(r.content[1]).toEqual({ type: 'image', mimeType: 'image/jpeg', data: JPEG.toString('base64') });
  });

  it('returns a PDF as an embedded resource block', async () => {
    body = PDF;
    disposition = 'inline; filename="Soup.pdf"';
    const r = await call({ recipe_id: 8 });
    expect(r.isError).toBeFalsy();
    expect(r.content[1]).toEqual({
      type: 'resource',
      resource: { uri: `${stub.url}/api/get_recipe_file/8/`, mimeType: 'application/pdf', blob: PDF.toString('base64') },
    });
  });

  it('takes the filename from an RFC 5987 filename* parameter', async () => {
    body = PDF;
    disposition = "inline; filename*=utf-8''Cr%C3%A8me%20br%C3%BBl%C3%A9e.pdf";
    const r = await call({ recipe_id: 10 });
    expect(JSON.parse(r.content[0].text).filename).toBe('Crème brûlée.pdf');
  });

  it('reports a recipe with no stored file when Tandoor sends only newlines', async () => {
    body = Buffer.from('\n \n\n');
    disposition = 'inline; filename="Plain.pdf"';
    const r = await call({ recipe_id: 9 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(
      'Recipe 9 has no stored file; only recipes synced from a Storage backend have one.',
    );
  });

  it('treats a body of CR, LF and tab as no stored file', async () => {
    body = Buffer.from('\r\n\t\r\n');
    disposition = 'inline; filename="Plain.pdf"';
    const r = await call({ recipe_id: 9 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(
      'Recipe 9 has no stored file; only recipes synced from a Storage backend have one.',
    );
  });

  it('stops scanning for blankness at the inline cap and treats the body as content', async () => {
    disposition = 'inline; filename="Huge.pdf"';
    respond = (res) => {
      const chunk = Buffer.alloc(64 * 1024, 0x0a);
      for (let sent = 0; sent <= INLINE_CAP_BYTES; sent += chunk.length) res.write(chunk);
    };
    const r = await call({ recipe_id: 13 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('is larger than the 5 MiB inline limit');
  }, 5000);

  it.each([
    ['a missing Content-Disposition', undefined],
    ['a malformed filename*', "inline; filename*=UTF-8''bad%ZZ.pdf"],
  ])('names the file after the recipe id for %s and still delivers it', async (_case, header) => {
    body = PDF;
    disposition = header;
    const r = await call({ recipe_id: 11 });
    expect(JSON.parse(r.content[0].text).filename).toBe('recipe-11');
    expect(r.content[1].resource.blob).toBe(PDF.toString('base64'));
  });

  it('cancels the Tandoor response when delivery abandons the body', async () => {
    disposition = 'inline; filename="Soup.pdf"';
    let closed!: () => void;
    const responseClosed = new Promise<void>((resolve) => { closed = resolve; });
    respond = (res) => {
      res.on('close', closed);
      res.write(PDF);
    };
    const r = await call({ recipe_id: 8, save: true });
    expect(r.content[0].text).toBe('Saving requires TANDOOR_MCP_DOWNLOAD_ROOT to be set to a folder on this machine.');
    await responseClosed;
  }, 2000);

  describe('save: true', () => {
    let root: string;
    afterEach(async () => {
      delete process.env.TANDOOR_MCP_DOWNLOAD_ROOT;
      await rm(root, { recursive: true, force: true });
    });

    it('writes the file under TANDOOR_MCP_DOWNLOAD_ROOT', async () => {
      root = await mkdtemp(path.join(tmpdir(), 'recipe-file-'));
      process.env.TANDOOR_MCP_DOWNLOAD_ROOT = root;
      body = PDF;
      disposition = 'inline; filename="Soup.pdf"';
      const r = await call({ recipe_id: 8, save: true });
      expect(r.isError).toBeFalsy();
      const saved = JSON.parse(r.content[0].text);
      expect(saved.path).toBe(path.join(root, 'Soup.pdf'));
      expect(await readFile(saved.path)).toEqual(PDF);
    });  });

  it('is listed with the download annotations and replaces get_recipe_file_metadata', async () => {
    const { tools } = await mcp.listTools();
    expect(tools.find((t) => t.name === 'download_recipe_file')?.annotations).toEqual({
      readOnlyHint: false, destructiveHint: false, idempotentHint: false,
    });
    expect(tools.map((t) => t.name)).not.toContain('get_recipe_file_metadata');
  });
});
