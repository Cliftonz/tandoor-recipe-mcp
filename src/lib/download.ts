import { randomUUID } from 'node:crypto';
import { link, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { guessMimeFromExt, sniffMime } from './mime.js';
import { expandHome } from './path-guard.js';
import { isHttpTransport } from './register.js';

export const INLINE_CAP_BYTES = 5 * 1024 * 1024;

const INLINE_CAP_LABEL = `${INLINE_CAP_BYTES / 1024 / 1024} MiB`;
const SNIFF_BYTES = 16;
const STEM_MAX_BYTES = 200;
const MAX_NAME_ATTEMPTS = 1000;
const INLINE_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const EXT_BY_MIME: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
const UNSAFE_CHARS = /[<>:"/\\|?*\p{Cc}\p{Cf}]/gu;
const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}]/gu;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
const GRAPHEMES = new Intl.Segmenter();
const NO_HARD_LINKS =
  "The download root's filesystem does not support hard links; set TANDOOR_MCP_DOWNLOAD_ROOT to a folder on a local disk.";

interface FileDelivery {
  body: ReadableStream<Uint8Array>;
  declaredSize: number;
  filename: string;
  idStem: string;
  url: string;
  save: boolean;
  signal?: AbortSignal;
}

const fail = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });
const displayName = (file: FileDelivery) => file.filename.replace(INVISIBLE_CHARS, '');
const emptyFile = (file: FileDelivery) => fail(`Tandoor returned an empty file for ${displayName(file)}.`);
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function deliverFile(file: FileDelivery): Promise<CallToolResult> {
  return file.save ? saveToDisk(file) : deliverInline(file);
}

async function deliverInline(file: FileDelivery): Promise<CallToolResult> {
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  for await (const chunk of file.body) {
    chunks.push(chunk);
    bytesRead += chunk.length;
    if (bytesRead > INLINE_CAP_BYTES) break;
  }
  if (bytesRead === 0) return emptyFile(file);
  const bytes = Buffer.concat(chunks);
  const mime = sniffMime(bytes.subarray(0, SNIFF_BYTES), file.filename);
  if (bytesRead > INLINE_CAP_BYTES) {
    const size = file.declaredSize > 0 ? `${file.declaredSize} bytes` : `more than ${INLINE_CAP_LABEL}`;
    return fail(
      `${displayName(file)} (${mime}, ${size}, ${file.url}) is larger than the ${INLINE_CAP_LABEL} inline limit. ` +
        'Retry with save: true to write it to TANDOOR_MCP_DOWNLOAD_ROOT.',
    );
  }
  const data = bytes.toString('base64');
  const meta = { type: 'text' as const, text: JSON.stringify({ filename: displayName(file), mime, size: bytes.length }) };
  const block = INLINE_IMAGE_MIMES.has(mime)
    ? { type: 'image' as const, data, mimeType: mime }
    : { type: 'resource' as const, resource: { uri: file.url, mimeType: mime, blob: data } };
  return { content: [meta, block] };
}

function capBytes(text: string): string {
  let out = '';
  let bytes = 0;
  for (const { segment } of GRAPHEMES.segment(text)) {
    bytes += Buffer.byteLength(segment);
    if (bytes > STEM_MAX_BYTES) break;
    out += segment;
  }
  return out;
}

function safeFileName(display: string, idStem: string, mime: string): { stem: string; ext: string } {
  const cleaned = display.replace(UNSAFE_CHARS, '_');
  const knownExt = guessMimeFromExt(cleaned) === 'application/octet-stream' ? '' : cleaned.slice(cleaned.lastIndexOf('.'));
  const stem = capBytes(cleaned.slice(0, cleaned.length - knownExt.length).replace(/^\.+/, '')).replace(/[. ]+$/, '');
  const safeStem = stem.trim() === '' ? idStem : stem;
  return {
    stem: WINDOWS_RESERVED.test(safeStem) ? `_${safeStem}` : safeStem,
    ext: EXT_BY_MIME[mime] ?? knownExt,
  };
}

async function readHead(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array[]> {
  const head: Uint8Array[] = [];
  let length = 0;
  while (length < SNIFF_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    head.push(value);
    length += value.length;
  }
  return head;
}

async function linkWithoutClobber(part: string, root: string, stem: string, ext: string): Promise<string> {
  for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
    const target = path.join(root, n === 1 ? `${stem}${ext}` : `${stem} (${n})${ext}`);
    try {
      await link(part, target);
      return target;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'ENOTSUP') throw new Error(NO_HARD_LINKS);
      if (code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Too many files named ${stem}${ext} in the download root.`);
}

async function writeAll(part: string, head: Uint8Array[], reader: ReadableStreamDefaultReader<Uint8Array>): Promise<number> {
  const handle = await open(part, 'wx');
  let size = 0;
  try {
    for (const chunk of head) {
      await handle.write(chunk);
      size += chunk.length;
    }
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      await handle.write(next.value);
      size += next.value.length;
    }
  } catch (err) {
    await handle.close().catch(() => undefined);
    throw err;
  }
  await handle.close();
  return size;
}

async function abandon(file: FileDelivery, text: string): Promise<CallToolResult> {
  await file.body.cancel();
  return fail(text);
}

async function saveToDisk(file: FileDelivery): Promise<CallToolResult> {
  if (isHttpTransport()) {
    return abandon(file, 'save: true only works over stdio; over HTTP the folder would be on the server machine, not yours.');
  }
  const raw = (process.env.TANDOOR_MCP_DOWNLOAD_ROOT ?? '').trim();
  if (raw === '') return abandon(file, 'Saving requires TANDOOR_MCP_DOWNLOAD_ROOT to be set to a folder on this machine.');
  const root = path.resolve(expandHome(raw));
  if (!(await stat(root).then((s) => s.isDirectory(), () => false))) {
    return abandon(file, `TANDOOR_MCP_DOWNLOAD_ROOT ${root} does not exist or is not a folder.`);
  }

  const reader = file.body.getReader();
  const cancelOnAbort = () => void reader.cancel(file.signal?.reason);
  file.signal?.addEventListener('abort', cancelOnAbort, { once: true });
  let part: string | undefined;
  let target: string;
  let size: number;
  let mime: string;
  try {
    const head = await readHead(reader);
    if (head.length === 0) {
      await reader.cancel();
      return emptyFile(file);
    }
    mime = sniffMime(Buffer.concat(head).subarray(0, SNIFF_BYTES), file.filename);
    const { stem, ext } = safeFileName(file.filename, file.idStem, mime);
    part = path.join(root, `.${stem}.${randomUUID()}.part`);
    size = await writeAll(part, head, reader);
    file.signal?.throwIfAborted();
    target = await linkWithoutClobber(part, root, stem, ext);
  } catch (err) {
    reader.cancel(err).catch(() => undefined);
    if (part) await rm(part, { force: true });
    return fail(`Saving ${file.url} failed: ${messageOf(err)}`);
  } finally {
    file.signal?.removeEventListener('abort', cancelOnAbort);
    reader.releaseLock();
  }
  await rm(part).catch(() => undefined);
  return { content: [{ type: 'text', text: JSON.stringify({ path: target, size, mime }) }] };
}
