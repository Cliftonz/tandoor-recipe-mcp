import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAdminTools } from '../src/tools/admin.js';
import { startStub, type Stub } from './helpers/stub-http.js';
import { INLINE_CAP_BYTES } from '../src/lib/download.js';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 10, 20, 30, 40]);
const PDF = new Uint8Array([...ascii('%PDF-1.7'), 10, 11]);
const CENTRAL_DIRECTORY_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x01, 0x02]);

function zipOf(name: string, data: Uint8Array, method = 0): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const header = new DataView(new ArrayBuffer(30));
  header.setUint32(0, 0x04034b50, true);
  header.setUint16(8, method, true);
  header.setUint32(14, crc32(data), true);
  header.setUint32(18, data.length, true);
  header.setUint32(22, data.length, true);
  header.setUint16(26, nameBytes.length, true);
  return Buffer.concat([new Uint8Array(header.buffer), nameBytes, data, CENTRAL_DIRECTORY_SIGNATURE]);
}

interface Reply {
  status: number;
  body: Uint8Array;
  filename: string;
}

describe('download_file over MCP', () => {
  let stub: Stub;
  let server: McpServer;
  let mcp: Client;
  let reply: Reply;
  let requestedPath: string | undefined;
  let authorization: string | undefined;
  let root: string;
  let rootBefore: string | undefined;

  beforeAll(async () => {
    stub = await startStub((req, res) => {
      requestedPath = req.url;
      authorization = req.headers.authorization;
      res.statusCode = reply.status;
      res.setHeader('content-disposition', `attachment; filename="${reply.filename}"`);
      res.end(reply.body);
    });
    server = new McpServer({ name: 'test', version: 'test' });
    registerAdminTools(server, new TandoorClient({ url: stub.url, token: 'tok-test' }));
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

  beforeEach(async () => {
    rootBefore = process.env.TANDOOR_MCP_DOWNLOAD_ROOT;
    root = await mkdtemp(path.join(tmpdir(), 'tandoor-download-file-'));
    process.env.TANDOOR_MCP_DOWNLOAD_ROOT = root;
  });

  afterEach(async () => {
    if (rootBefore === undefined) delete process.env.TANDOOR_MCP_DOWNLOAD_ROOT;
    else process.env.TANDOOR_MCP_DOWNLOAD_ROOT = rootBefore;
    await rm(root, { recursive: true, force: true });
  });

  const call = (args: Record<string, unknown>): Promise<any> => mcp.callTool({ name: 'download_file', arguments: args });

  it('returns a JPEG entry as an image named after the Tandoor file with the entry extension', async () => {
    reply = { status: 200, body: zipOf('files/1/9f2c_photo.jpg', JPEG), filename: 'Grandma soup.zip' };
    const r = await call({ file_id: 7 });
    expect(r.isError).toBeFalsy();
    expect(requestedPath).toBe('/api/download-file/7/');
    expect(authorization).toBe('Bearer tok-test');
    expect(JSON.parse(r.content[0].text)).toEqual({ filename: 'Grandma soup.jpg', mime: 'image/jpeg', size: JPEG.length });
    expect(r.content[1]).toEqual({ type: 'image', mimeType: 'image/jpeg', data: Buffer.from(JPEG).toString('base64') });
  });

  it('uses the stripped Tandoor name alone when the entry has no extension', async () => {
    reply = { status: 200, body: zipOf('files/1/9f2c_notes', PDF), filename: 'Notes.zip' };
    const r = await call({ file_id: 7 });
    expect(JSON.parse(r.content[0].text).filename).toBe('Notes');
  });

  it('does not repeat an extension the Tandoor name already ends with, ignoring case', async () => {
    reply = { status: 200, body: zipOf('files/1/9f2c_photo.jpg', JPEG), filename: 'Soup.JPG.zip' };
    const r = await call({ file_id: 7 });
    expect(JSON.parse(r.content[0].text).filename).toBe('Soup.JPG');
  });

  it('appends only the last extension of the entry name', async () => {
    reply = { status: 200, body: zipOf('files/1/9f2c_photo.tar.gz', PDF), filename: 'Backup.zip' };
    const r = await call({ file_id: 7 });
    expect(JSON.parse(r.content[0].text).filename).toBe('Backup.gz');
  });

  it('names the file file-<id> when the Tandoor name is empty', async () => {
    reply = { status: 200, body: zipOf('files/1/9f2c_photo.jpg', JPEG), filename: '.zip' };
    const r = await call({ file_id: 7 });
    expect(JSON.parse(r.content[0].text).filename).toBe('file-7.jpg');
  });

  it('saves under file-<id> when the Tandoor name is empty', async () => {
    reply = { status: 200, body: zipOf('files/1/9f2c_photo.jpg', JPEG), filename: '.zip' };
    const r = await call({ file_id: 7, save: true });
    expect(JSON.parse(r.content[0].text).path).toBe(path.join(root, 'file-7.jpg'));
  });

  it('reports the entry byte count when the file is over the inline cap', async () => {
    const big = new Uint8Array(INLINE_CAP_BYTES + 1);
    big.set(PDF);
    reply = { status: 200, body: zipOf('files/1/ab_big.pdf', big), filename: 'Big.zip' };
    const r = await call({ file_id: 9 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain(`${big.length} bytes`);
  });

  it('returns a PDF entry as an embedded resource at the download-file URL', async () => {
    reply = { status: 200, body: zipOf('files/1/ab_menu.pdf', PDF), filename: 'Menu.zip' };
    const r = await call({ file_id: 9 });
    expect(r.isError).toBeFalsy();
    expect(r.content[1]).toEqual({
      type: 'resource',
      resource: { uri: `${stub.url}/api/download-file/9/`, mimeType: 'application/pdf', blob: Buffer.from(PDF).toString('base64') },
    });
  });

  it('reports an unexpected archive when Tandoor sends a deflated zip', async () => {
    reply = { status: 200, body: zipOf('files/1/ab_menu.pdf', PDF, 8), filename: 'Menu.zip' };
    const r = await call({ file_id: 9 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('unexpected archive');
  });

  it('returns a tool error when Tandoor answers 400 for a missing file', async () => {
    reply = { status: 400, body: new TextEncoder().encode('{}'), filename: 'x.zip' };
    const r = await call({ file_id: 404 });
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{
      type: 'text',
      text: 'Tandoor could not read user file 404: it may not exist, belong to another space, or be missing from storage.',
    }]);
  });

  it('saves the entry to the download root with save: true', async () => {
    reply = { status: 200, body: zipOf('files/1/ab_menu.pdf', PDF), filename: 'Menu.zip' };
    const r = await call({ file_id: 9, save: true });
    expect(r.isError).toBeFalsy();
    const saved = JSON.parse(r.content[0].text);
    expect(saved).toEqual({ path: path.join(root, 'Menu.pdf'), size: PDF.length, mime: 'application/pdf' });
    expect(new Uint8Array(await readFile(saved.path))).toEqual(PDF);
  });

  it('is listed as a non-read-only, non-destructive, non-idempotent tool', async () => {
    const { tools } = await mcp.listTools();
    const tool = tools.find((t) => t.name === 'download_file')!;
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
  });
});
