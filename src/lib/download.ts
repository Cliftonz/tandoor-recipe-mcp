import { link, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { sniffMime } from './mime.js';

export const INLINE_CAP = 5 * 1024 * 1024;

const SNIFF_BYTES = 16;
const BASE_NAME_MAX = 100;
const INLINE_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const EXT_BY_MIME: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
};
const UNSAFE_CHARS = /[<>:"/\\|?*\p{Cc}]/gu;

export interface TandoorFile {
  body: ReadableStream<Uint8Array>;
  size: number;
  filename: string;
  fallbackName: string;
  url: string;
  save: boolean;
}

const fail = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

export function deliverFile(file: TandoorFile): Promise<CallToolResult> {
  return file.save ? saveToDisk(file) : deliverInline(file);
}

async function deliverInline(file: TandoorFile): Promise<CallToolResult> {
  const chunks: Uint8Array[] = [];
  let read = 0;
  for await (const chunk of file.body) {
    chunks.push(chunk);
    read += chunk.length;
    if (read > INLINE_CAP) break;
  }
  const bytes = Buffer.concat(chunks);
  const mime = sniffMime(bytes.subarray(0, SNIFF_BYTES), file.filename);
  if (read > INLINE_CAP) {
    return fail(
      `${file.filename} (${mime}, ${file.size} bytes, ${file.url}) is larger than the 5 MB inline limit. ` +
        'Retry with save: true to write it to TANDOOR_MCP_DOWNLOAD_ROOT.',
    );
  }
  const data = bytes.toString('base64');
  const meta = { type: 'text' as const, text: JSON.stringify({ filename: file.filename, mime, size: bytes.length }) };
  const block = INLINE_IMAGE_MIMES.has(mime)
    ? { type: 'image' as const, data, mimeType: mime }
    : { type: 'resource' as const, resource: { uri: file.url, mimeType: mime, blob: data } };
  return { content: [meta, block] };
}

function downloadRoot(): string | undefined {
  const raw = (process.env.TANDOOR_MCP_DOWNLOAD_ROOT ?? '').trim();
  if (raw === '') return undefined;
  return path.resolve(raw);
}

function safeFileName(display: string, fallback: string, mime: string): { base: string; ext: string } {
  const cleaned = display.replace(UNSAFE_CHARS, '_').replace(/^\.+/, '');
  const dot = cleaned.lastIndexOf('.');
  const stem = [...(dot > 0 ? cleaned.slice(0, dot) : cleaned)].slice(0, BASE_NAME_MAX).join('');
  return { base: stem || fallback, ext: EXT_BY_MIME[mime] ?? '' };
}

async function readHead(body: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = body.getReader();
  const head: Uint8Array[] = [];
  let length = 0;
  while (length < SNIFF_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    head.push(value);
    length += value.length;
  }
  reader.releaseLock();
  return head;
}

async function linkWithoutClobber(part: string, root: string, base: string, ext: string): Promise<string> {
  for (let n = 1; ; n++) {
    const target = path.join(root, n === 1 ? `${base}${ext}` : `${base} (${n})${ext}`);
    try {
      await link(part, target);
      return target;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}

async function saveToDisk(file: TandoorFile): Promise<CallToolResult> {
  const root = downloadRoot();
  if (!root) return fail('Saving requires TANDOOR_MCP_DOWNLOAD_ROOT to be set to a folder on this machine.');
  if ((process.env.TANDOOR_MCP_TRANSPORT || '').toLowerCase() === 'http') {
    return fail('save: true only works over stdio; over HTTP the folder would be on the server machine, not yours.');
  }
  const head = await readHead(file.body);
  const mime = sniffMime(Buffer.concat(head).subarray(0, SNIFF_BYTES), file.filename);
  const { base, ext } = safeFileName(file.filename, file.fallbackName, mime);
  const part = path.join(root, `.${base}${ext}.part`);
  try {
    const handle = await open(part, 'w');
    let size = 0;
    try {
      for (const chunk of head) {
        await handle.write(chunk);
        size += chunk.length;
      }
      for await (const chunk of file.body) {
        await handle.write(chunk);
        size += chunk.length;
      }
    } finally {
      await handle.close();
    }
    const target = await linkWithoutClobber(part, root, base, ext);
    await rm(part);
    return { content: [{ type: 'text', text: JSON.stringify({ path: target, size, mime }) }] };
  } catch (err) {
    await rm(part, { force: true });
    return fail(`Saving ${file.url} failed: ${(err as Error).message}`);
  }
}
