import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deliverFile, INLINE_CAP } from '../src/lib/download.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 10, 20, 30]);
const TEXT = new TextEncoder().encode('just some plain words here');
const URL_ = 'https://tandoor.test/media/files/abc.pdf';

function streamOf(bytes: Uint8Array, chunkSize = bytes.length): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

function endlessSource() {
  const state = { cancelled: false, pulled: 0 };
  const chunk = new Uint8Array(1024 * 1024);
  chunk.set(PNG);
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(chunk.slice());
      state.pulled += chunk.length;
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

function file(body: ReadableStream<Uint8Array>, overrides: Partial<Parameters<typeof deliverFile>[0]> = {}) {
  return { body, size: 123, filename: 'Soup.pdf', fallbackName: 'file-7', url: URL_, save: false, ...overrides };
}

const ENV_KEYS = ['TANDOOR_MCP_DOWNLOAD_ROOT', 'TANDOOR_MCP_TRANSPORT'] as const;
let saved: Record<string, string | undefined>;
let root: string;

beforeEach(async () => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  delete process.env.TANDOOR_MCP_TRANSPORT;
  root = await mkdtemp(path.join(tmpdir(), 'tandoor-dl-'));
  process.env.TANDOOR_MCP_DOWNLOAD_ROOT = root;
});

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await rm(root, { recursive: true, force: true });
});

describe('deliverFile inline', () => {
  it('returns an image block and metadata for a PNG', async () => {
    const result = await deliverFile(file(streamOf(PNG, 5)));
    expect(result.isError).toBeUndefined();
    expect(result.content).toContainEqual({
      type: 'image',
      data: Buffer.from(PNG).toString('base64'),
      mimeType: 'image/png',
    });
    const meta = result.content.find((c) => c.type === 'text');
    expect(JSON.parse((meta as { text: string }).text)).toEqual({ filename: 'Soup.pdf', mime: 'image/png', size: PNG.length });
  });

  it('returns an embedded resource for a non-image', async () => {
    const result = await deliverFile(file(streamOf(TEXT), { filename: 'notes' }));
    expect(result.content).toContainEqual({
      type: 'resource',
      resource: { uri: URL_, mimeType: 'application/octet-stream', blob: Buffer.from(TEXT).toString('base64') },
    });
    expect(result.content.filter((c) => c.type === 'text')).toHaveLength(1);
  });

  it('accepts a body of exactly the cap', async () => {
    const bytes = new Uint8Array(INLINE_CAP);
    bytes.set(PNG);
    const result = await deliverFile(file(streamOf(bytes, 1024 * 1024)));
    expect(result.isError).toBeUndefined();
    expect(INLINE_CAP).toBe(5 * 1024 * 1024);
  });

  it('stops at the cap, cancels the stream and points at save: true', async () => {
    const { stream, state } = endlessSource();
    const result = await deliverFile(file(stream, { size: 9_000_000 }));
    expect(result.isError).toBe(true);
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(INLINE_CAP + 3 * 1024 * 1024);
    const text = (result.content[0] as { text: string }).text;
    for (const part of ['Soup.pdf', 'image/png', '9000000', URL_, 'save: true']) expect(text).toContain(part);
  });
});

describe('deliverFile save', () => {
  const saveOf = (bytes: Uint8Array, overrides: Partial<Parameters<typeof deliverFile>[0]> = {}) =>
    deliverFile(file(streamOf(bytes, 3), { save: true, ...overrides }));

  it('refuses when TANDOOR_MCP_DOWNLOAD_ROOT is unset', async () => {
    delete process.env.TANDOOR_MCP_DOWNLOAD_ROOT;
    const result = await saveOf(PNG);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('TANDOOR_MCP_DOWNLOAD_ROOT');
  });

  it('refuses when TANDOOR_MCP_DOWNLOAD_ROOT is empty', async () => {
    process.env.TANDOOR_MCP_DOWNLOAD_ROOT = '  ';
    const result = await saveOf(PNG);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('TANDOOR_MCP_DOWNLOAD_ROOT');
  });

  it('reports an absolute path when the root is relative', async () => {
    process.env.TANDOOR_MCP_DOWNLOAD_ROOT = path.relative(process.cwd(), root);
    const result = await saveOf(PNG);
    expect(JSON.parse((result.content[0] as { text: string }).text).path).toBe(path.join(root, 'Soup.png'));
  });

  it('refuses over the HTTP transport', async () => {
    process.env.TANDOOR_MCP_TRANSPORT = 'http';
    const result = await saveOf(PNG);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('stdio');
    expect(await readdir(root)).toEqual([]);
  });

  it('writes the bytes under the sniffed extension and reports path, size and mime', async () => {
    const result = await saveOf(JPEG, { filename: 'Soup.pdf' });
    const target = path.join(root, 'Soup.jpg');
    expect(await readFile(target)).toEqual(Buffer.from(JPEG));
    expect(await readdir(root)).toEqual(['Soup.jpg']);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({ path: target, size: JPEG.length, mime: 'image/jpeg' });
  });

  it('sanitizes separators, control and reserved characters and strips leading dots', async () => {
    await saveOf(PNG, { filename: '..a/b\\c<d>e:f"g|h?i*j\u0001k.png' });
    expect(await readdir(root)).toEqual(['a_b_c_d_e_f_g_h_i_j_k.png']);
  });

  it('caps the base name at 100 characters', async () => {
    await saveOf(PNG, { filename: `${'x'.repeat(150)}.png` });
    expect(await readdir(root)).toEqual([`${'x'.repeat(100)}.png`]);
  });

  it('falls back to the id-based name when nothing remains', async () => {
    await saveOf(PNG, { filename: '...' });
    expect(await readdir(root)).toEqual(['file-7.png']);
  });

  it('never overwrites an existing file', async () => {
    await writeFile(path.join(root, 'Soup.png'), 'first');
    await writeFile(path.join(root, 'Soup (2).png'), 'second');
    const result = await saveOf(PNG);
    expect(await readFile(path.join(root, 'Soup.png'), 'utf8')).toBe('first');
    expect(await readFile(path.join(root, 'Soup (3).png'))).toEqual(Buffer.from(PNG));
    expect((result.content[0] as { text: string }).text).toContain('Soup (3).png');
  });

  it('does not clobber a file that appears while streaming', async () => {
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (sent) {
          await writeFile(path.join(root, 'Soup.png'), 'racer');
          return controller.close();
        }
        sent = true;
        controller.enqueue(PNG);
      },
    });
    await deliverFile(file(body, { save: true }));
    expect(await readFile(path.join(root, 'Soup.png'), 'utf8')).toBe('racer');
    expect(await readFile(path.join(root, 'Soup (2).png'))).toEqual(Buffer.from(PNG));
  });

  it('deletes the part file and returns isError when the stream fails', async () => {
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) return controller.error(new Error('connection reset'));
        sent = true;
        controller.enqueue(PNG);
      },
    });
    const result = await deliverFile(file(body, { save: true }));
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('connection reset');
    expect(await readdir(root)).toEqual([]);
  });
});
