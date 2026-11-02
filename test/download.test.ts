import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import { mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { deliverFile, INLINE_CAP_BYTES } from '../src/lib/download.js';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 10, 20, 30]);
const GIF = new Uint8Array([...ascii('GIF89a'), 1, 2, 3]);
const WEBP = new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBPVP8 '), 1, 2]);
const PDF = new Uint8Array([...ascii('%PDF-1.7'), 10, 11]);
const TEXT = new TextEncoder().encode('just some plain words here');
const SOURCE_URL = 'https://tandoor.test/media/files/abc.pdf';

type Delivery = Parameters<typeof deliverFile>[0];

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

function file(body: ReadableStream<Uint8Array>, overrides: Partial<Delivery> = {}): Delivery {
  return { body, declaredSize: 123, filename: 'Soup.pdf', idStem: 'file-7', url: SOURCE_URL, save: false, ...overrides };
}

const textOf = (result: Awaited<ReturnType<typeof deliverFile>>) => (result.content[0] as { text: string }).text;

const ENV_KEYS = ['TANDOOR_MCP_DOWNLOAD_ROOT', 'TANDOOR_MCP_TRANSPORT'] as const;
let envBefore: Record<string, string | undefined>;
let root: string;

beforeEach(async () => {
  envBefore = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  delete process.env.TANDOOR_MCP_TRANSPORT;
  root = await mkdtemp(path.join(tmpdir(), 'tandoor-dl-'));
  process.env.TANDOOR_MCP_DOWNLOAD_ROOT = root;
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) {
    if (envBefore[k] === undefined) delete process.env[k];
    else process.env[k] = envBefore[k];
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

  it.each([
    ['image/jpeg', JPEG],
    ['image/gif', GIF],
    ['image/webp', WEBP],
  ])('returns an image block for %s', async (mimeType, bytes) => {
    const result = await deliverFile(file(streamOf(bytes)));
    expect(result.content).toContainEqual({ type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType });
  });

  it('returns an embedded resource for a non-image', async () => {
    const result = await deliverFile(file(streamOf(TEXT), { filename: 'notes' }));
    expect(result.content).toContainEqual({
      type: 'resource',
      resource: { uri: SOURCE_URL, mimeType: 'application/octet-stream', blob: Buffer.from(TEXT).toString('base64') },
    });
    expect(result.content.filter((c) => c.type === 'text')).toHaveLength(1);
  });

  it('strips control and format characters from the name shown to the model', async () => {
    const result = await deliverFile(file(streamOf(PNG), { filename: 'So\u0007up​.pdf' }));
    const meta = result.content.find((c) => c.type === 'text');
    expect(JSON.parse((meta as { text: string }).text).filename).toBe('Soup.pdf');
  });

  it('accepts a body of exactly the cap', async () => {
    const bytes = new Uint8Array(INLINE_CAP_BYTES);
    bytes.set(PNG);
    const result = await deliverFile(file(streamOf(bytes, 1024 * 1024)));
    expect(result.isError).toBeUndefined();
    expect(INLINE_CAP_BYTES).toBe(5 * 1024 * 1024);
  });

  it('stops at the cap, cancels the stream and points at save: true', async () => {
    const { stream, state } = endlessSource();
    const result = await deliverFile(file(stream, { declaredSize: 9_000_000 }));
    expect(result.isError).toBe(true);
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(INLINE_CAP_BYTES + 3 * 1024 * 1024);
    for (const part of ['Soup.pdf', 'image/png', '9000000 bytes', SOURCE_URL, 'save: true', '5 MiB']) {
      expect(textOf(result)).toContain(part);
    }
  });

  it('says "more than 5 MiB" when the declared size is unknown', async () => {
    const { stream } = endlessSource();
    const result = await deliverFile(file(stream, { declaredSize: 0 }));
    expect(textOf(result)).toContain('more than 5 MiB');
  });

  it('rejects an empty file', async () => {
    const result = await deliverFile(file(streamOf(new Uint8Array(0))));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Tandoor returned an empty file for Soup.pdf.');
  });
});

describe('deliverFile save', () => {
  const saveOf = (bytes: Uint8Array, overrides: Partial<Delivery> = {}) =>
    deliverFile(file(streamOf(bytes, 3), { save: true, ...overrides }));
  const savedName = async (bytes: Uint8Array, filename: string) =>
    path.basename(JSON.parse(textOf(await saveOf(bytes, { filename }))).path);

  it('refuses and cancels when TANDOOR_MCP_DOWNLOAD_ROOT is unset', async () => {
    delete process.env.TANDOOR_MCP_DOWNLOAD_ROOT;
    const { stream, state } = endlessSource();
    const result = await deliverFile(file(stream, { save: true }));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('TANDOOR_MCP_DOWNLOAD_ROOT');
    expect(state.cancelled).toBe(true);
  });

  it('refuses when TANDOOR_MCP_DOWNLOAD_ROOT is empty', async () => {
    process.env.TANDOOR_MCP_DOWNLOAD_ROOT = '  ';
    const result = await saveOf(PNG);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('TANDOOR_MCP_DOWNLOAD_ROOT');
  });

  it('refuses over the HTTP transport before looking at the root, and cancels', async () => {
    process.env.TANDOOR_MCP_TRANSPORT = 'http';
    delete process.env.TANDOOR_MCP_DOWNLOAD_ROOT;
    const { stream, state } = endlessSource();
    const result = await deliverFile(file(stream, { save: true }));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('stdio');
    expect(state.cancelled).toBe(true);
  });

  it('refuses a missing root without creating it, and cancels', async () => {
    const missing = path.join(root, 'nope');
    process.env.TANDOOR_MCP_DOWNLOAD_ROOT = missing;
    const { stream, state } = endlessSource();
    const result = await deliverFile(file(stream, { save: true }));
    expect(textOf(result)).toBe(`TANDOOR_MCP_DOWNLOAD_ROOT ${missing} does not exist or is not a folder.`);
    expect(state.cancelled).toBe(true);
    expect(await readdir(root)).toEqual([]);
  });

  it('refuses a root that is a file', async () => {
    const notFolder = path.join(root, 'plain');
    await writeFile(notFolder, 'x');
    process.env.TANDOOR_MCP_DOWNLOAD_ROOT = notFolder;
    const result = await saveOf(PNG);
    expect(textOf(result)).toBe(`TANDOOR_MCP_DOWNLOAD_ROOT ${notFolder} does not exist or is not a folder.`);
  });

  it('expands ~ in the root', async () => {
    const missing = `nope-${randomUUID()}`;
    process.env.TANDOOR_MCP_DOWNLOAD_ROOT = `~/${missing}`;
    const result = await saveOf(PNG);
    expect(textOf(result)).toContain(path.join(homedir(), missing));
  });

  it('reports an absolute path when the root is relative', async () => {
    process.env.TANDOOR_MCP_DOWNLOAD_ROOT = path.relative(process.cwd(), root);
    const result = await saveOf(PNG);
    expect(JSON.parse(textOf(result)).path).toBe(path.join(root, 'Soup.png'));
  });

  it('writes the bytes under the sniffed extension and reports path, size and mime', async () => {
    const result = await saveOf(JPEG, { filename: 'Soup.pdf' });
    const target = path.join(root, 'Soup.jpg');
    expect(await readFile(target)).toEqual(Buffer.from(JPEG));
    expect(await readdir(root)).toEqual(['Soup.jpg']);
    expect(JSON.parse(textOf(result))).toEqual({ path: target, size: JPEG.length, mime: 'image/jpeg' });
  });

  it.each([
    ['gif', GIF],
    ['webp', WEBP],
    ['pdf', PDF],
  ])('saves a %s under its sniffed extension', async (ext, bytes) => {
    expect(await savedName(bytes, 'Soup.png')).toBe(`Soup.${ext}`);
    expect(await readFile(path.join(root, `Soup.${ext}`))).toEqual(Buffer.from(bytes));
  });

  it('keeps an unknown extension as part of the stem', async () => {
    expect(await savedName(TEXT, 'notes.txt')).toBe('notes.txt');
    expect(await savedName(PNG, "Dr. Smith's stew")).toBe("Dr. Smith's stew.png");
  });

  it('keeps a known extension when the sniffed type has none', async () => {
    expect(await savedName(TEXT, 'clip.mp4')).toBe('clip.mp4');
  });

  it('sanitizes separators, control, format and reserved characters and strips leading dots', async () => {
    expect(await savedName(PNG, '..a/b\\c<d>e:f"g|h?i*j\u0001k​l.png')).toBe('a_b_c_d_e_f_g_h_i_j_k_l.png');
  });

  it('strips trailing dots and spaces from the stem', async () => {
    expect(await savedName(PNG, 'Soup. . .png')).toBe('Soup.png');
  });

  it('caps the stem at 200 UTF-8 bytes without splitting a grapheme', async () => {
    expect(await savedName(PNG, `x${'é'.repeat(100)}.png`)).toBe(`x${'é'.repeat(66)}.png`);
  });

  it.each(['CON', 'prn', 'Aux.png', 'nul.txt', 'COM1', 'lpt9.png'])('prefixes the reserved name %s', async (name) => {
    expect(await savedName(PNG, name)).toMatch(/^_/);
  });

  it.each(['...', '   ', '.png'])('falls back to the id stem for %j', async (name) => {
    expect(await savedName(PNG, name)).toBe('file-7.png');
  });

  it('never overwrites an existing file', async () => {
    await writeFile(path.join(root, 'Soup.png'), 'first');
    await writeFile(path.join(root, 'Soup (2).png'), 'second');
    const result = await saveOf(PNG);
    expect(await readFile(path.join(root, 'Soup.png'), 'utf8')).toBe('first');
    expect(await readFile(path.join(root, 'Soup (3).png'))).toEqual(Buffer.from(PNG));
    expect(textOf(result)).toContain('Soup (3).png');
  });

  it('gives up after 1000 names', async () => {
    await writeFile(path.join(root, 'Soup.png'), 'x');
    for (let n = 2; n <= 1000; n++) await writeFile(path.join(root, `Soup (${n}).png`), 'x');
    const result = await saveOf(PNG);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Too many files named Soup.png in the download root.');
    expect((await readdir(root)).filter((n) => n.endsWith('.part'))).toEqual([]);
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

  it('never truncates or writes through a pre-existing part file or symlink', async () => {
    const outside = path.join(root, 'outside.txt');
    await writeFile(outside, 'secret');
    await writeFile(path.join(root, '.Soup.png.part'), 'stale');
    await symlink(outside, path.join(root, '.Soup.part'));
    await saveOf(PNG);
    expect(await readFile(path.join(root, '.Soup.png.part'), 'utf8')).toBe('stale');
    expect(await readlink(path.join(root, '.Soup.part'))).toBe(outside);
    expect(await readFile(outside, 'utf8')).toBe('secret');
  });

  it('lets two concurrent saves of the same name both land', async () => {
    const other = new Uint8Array([...PNG, 42, 43, 44]);
    const results = await Promise.all([saveOf(PNG), saveOf(other)]);
    expect(results.map((r) => r.isError)).toEqual([undefined, undefined]);
    const contents = await Promise.all(['Soup.png', 'Soup (2).png'].map((n) => readFile(path.join(root, n))));
    expect(contents.map((b) => b.length).sort()).toEqual([PNG.length, other.length]);
    expect(contents).toContainEqual(Buffer.from(PNG));
    expect(contents).toContainEqual(Buffer.from(other));
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
    expect(textOf(result)).toContain('connection reset');
    expect(await readdir(root)).toEqual([]);
    expect(body.locked).toBe(false);
  });

  it('returns isError when the stream fails before 16 bytes', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error('boom');
      },
    });
    const result = await deliverFile(file(body, { save: true }));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('boom');
    expect(await readdir(root)).toEqual([]);
  });

  it('returns isError and cancels when the part file cannot be opened', async () => {
    const open = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      if (String(args[0]).endsWith('.part')) throw Object.assign(new Error('EACCES: injected'), { code: 'EACCES' });
      return open(...args);
    });
    const { stream, state } = endlessSource();
    const result = await deliverFile(file(stream, { save: true }));
    expect(result.isError).toBe(true);
    expect(state.cancelled).toBe(true);
  });

  it('rejects an empty file', async () => {
    const result = await saveOf(new Uint8Array(0));
    expect(textOf(result)).toBe('Tandoor returned an empty file for Soup.pdf.');
    expect(await readdir(root)).toEqual([]);
  });

  it('stops, cleans up and returns isError when aborted mid-save', async () => {
    const controller = new AbortController();
    const state = { cancelled: false };
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        if (sent) {
          controller.abort();
          return new Promise(() => {});
        }
        sent = true;
        stream.enqueue(PNG);
      },
      cancel() {
        state.cancelled = true;
      },
    });
    const result = await deliverFile(file(body, { save: true, signal: controller.signal }));
    expect(result.isError).toBe(true);
    expect(state.cancelled).toBe(true);
    expect(await readdir(root)).toEqual([]);
  });
});

describe('deliverFile inline failures', () => {
  it('returns isError when the stream fails mid-read', async () => {
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) return controller.error(new Error('connection reset'));
        sent = true;
        controller.enqueue(PNG);
      },
    });
    const result = await deliverFile(file(body));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Downloading Soup.pdf failed: connection reset');
    expect(body.locked).toBe(false);
  });

  it('stops and returns isError when aborted mid-read', async () => {
    const controller = new AbortController();
    const state = { cancelled: false };
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        if (sent) {
          controller.abort();
          return new Promise(() => {});
        }
        sent = true;
        stream.enqueue(PNG);
      },
      cancel() {
        state.cancelled = true;
      },
    });
    const result = await deliverFile(file(body, { signal: controller.signal }));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^Downloading Soup\.pdf failed: /);
    expect(state.cancelled).toBe(true);
  });
});

describe('deliverFile save filesystem faults', () => {
  const errno = (code: string) => Object.assign(new Error(`${code}: injected`), { code });
  const save = () => deliverFile(file(streamOf(PNG, 3), { save: true }));
  it('reports the write error, not the close error, and removes the part file', async () => {
    const open = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args);
      const write = handle.write.bind(handle);
      const close = handle.close.bind(handle);
      let writes = 0;
      vi.spyOn(handle, 'write').mockImplementation(((...writeArgs: Parameters<typeof write>) => {
        writes += 1;
        return writes === 2 ? Promise.reject(errno('ENOSPC')) : write(...writeArgs);
      }) as typeof write);
      vi.spyOn(handle, 'close').mockImplementation(async () => {
        await close();
        throw errno('EBADF');
      });
      return handle;
    });
    const result = await save();
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ENOSPC');
    expect(textOf(result)).not.toContain('EBADF');
    expect(await readdir(root)).toEqual([]);
  });

  it.each(['EPERM', 'ENOTSUP'])('explains missing hard-link support on %s', async (code) => {
    vi.spyOn(fs, 'link').mockRejectedValue(errno(code));
    const result = await save();
    expect(textOf(result)).toBe(
      "The download root's filesystem does not support hard links; set TANDOOR_MCP_DOWNLOAD_ROOT to a folder on a local disk.",
    );
    expect(await readdir(root)).toEqual([]);
  });

  it('reports success when the part file cannot be removed after linking', async () => {
    vi.spyOn(fs, 'rm').mockRejectedValueOnce(errno('EACCES'));
    const result = await save();
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result)).path).toBe(path.join(root, 'Soup.png'));
    expect(await readFile(path.join(root, 'Soup.png'))).toEqual(Buffer.from(PNG));
  });

  it('reports other link errors as a general failure and removes the part file', async () => {
    vi.spyOn(fs, 'link').mockRejectedValue(errno('EIO'));
    const result = await save();
    expect(textOf(result)).toBe(`Saving ${SOURCE_URL} failed: EIO: injected`);
    expect(await readdir(root)).toEqual([]);
  });
});
