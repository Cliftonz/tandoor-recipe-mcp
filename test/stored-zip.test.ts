import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { openStoredZip } from '../src/lib/stored-zip.js';

const fixture = new Uint8Array(
  readFileSync(new URL('./fixtures/stored-zip/tandoor-download.zip', import.meta.url)),
);
const fixtureContent = new Uint8Array(Array.from({ length: 10240 }, (_, i) => i % 256));
const UNEXPECTED = 'unexpected archive from Tandoor download-file';

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

function trackedSource(bytes: Uint8Array, chunkSize: number) {
  let offset = 0;
  const source = { cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset < bytes.length) controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
    cancel() {
      source.cancelled = true;
    },
  });
  return { stream, source };
}

function localEntry(opts: {
  name: string;
  data: Uint8Array;
  method?: number;
  flags?: number;
  size?: number;
  crc?: number;
  extra?: Uint8Array;
}): Uint8Array {
  const name = new TextEncoder().encode(opts.name);
  const extra = opts.extra ?? new Uint8Array(0);
  const header = new DataView(new ArrayBuffer(30));
  header.setUint32(0, 0x04034b50, true);
  header.setUint16(6, opts.flags ?? 0, true);
  header.setUint16(8, opts.method ?? 0, true);
  header.setUint32(14, opts.crc ?? crc32(opts.data), true);
  header.setUint32(18, opts.size ?? opts.data.length, true);
  header.setUint16(26, name.length, true);
  header.setUint16(28, extra.length, true);
  return Buffer.concat([new Uint8Array(header.buffer), name, extra, opts.data]);
}

const centralDirectorySignature = new Uint8Array([0x50, 0x4b, 0x01, 0x02]);

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}

describe('openStoredZip', () => {
  it('returns the entry name and exact bytes of a Python ZipFile.writestr archive', async () => {
    const entry = await openStoredZip(streamOf(fixture));
    expect(entry.name).toBe('files/1/9f2c_photo.jpg');
    expect(await readAll(entry.body)).toEqual(fixtureContent);
  });

  it('reassembles the entry when the archive arrives one byte at a time', async () => {
    const entry = await openStoredZip(streamOf(fixture, 1));
    expect(entry.name).toBe('files/1/9f2c_photo.jpg');
    expect(await readAll(entry.body)).toEqual(fixtureContent);
  });

  it('yields entry bytes before the archive has finished arriving', async () => {
    expect.assertions(1);
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const archive = localEntry({ name: 'a.bin', data });
    const neverEnding = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(archive.subarray(0, archive.length - 4));
      },
    });
    const entry = await openStoredZip(neverEnding);
    for await (const chunk of entry.body) {
      expect(Array.from(chunk)).toEqual([1, 2, 3, 4]);
      break;
    }
  });

  it('returns an empty body for a zero-length entry', async () => {
    const archive = Buffer.concat([localEntry({ name: 'empty.txt', data: new Uint8Array(0) }), centralDirectorySignature]);
    const entry = await openStoredZip(streamOf(archive));
    expect(entry.name).toBe('empty.txt');
    expect(await readAll(entry.body)).toEqual(new Uint8Array(0));
  });

  it('skips the extra field before the entry bytes', async () => {
    const archive = Buffer.concat([
      localEntry({ name: 'a.bin', data: new Uint8Array([9, 8, 7]), extra: new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]) }),
      centralDirectorySignature,
    ]);
    const entry = await openStoredZip(streamOf(archive));
    expect(entry.name).toBe('a.bin');
    expect(await readAll(entry.body)).toEqual(new Uint8Array([9, 8, 7]));
  });

  it('rejects a deflated entry', async () => {
    const archive = Buffer.concat([localEntry({ name: 'a.jpg', data: new Uint8Array([1]), method: 8 }), centralDirectorySignature]);
    await expect(openStoredZip(streamOf(archive))).rejects.toThrow(UNEXPECTED);
  });

  it('rejects input without a local file header signature', async () => {
    const archive = Buffer.concat([centralDirectorySignature, new Uint8Array(40)]);
    await expect(openStoredZip(streamOf(archive))).rejects.toThrow(UNEXPECTED);
  });

  it('rejects any entry with the data-descriptor flag set', async () => {
    const archive = Buffer.concat([
      localEntry({ name: 'a.jpg', data: new Uint8Array([1, 2]), flags: 0x08 }),
      centralDirectorySignature,
    ]);
    await expect(openStoredZip(streamOf(archive))).rejects.toThrow(UNEXPECTED);
  });

  it('errors the body when a second local header follows the entry', async () => {
    const archive = Buffer.concat([
      localEntry({ name: 'a.jpg', data: new Uint8Array([1, 2]) }),
      localEntry({ name: 'b.jpg', data: new Uint8Array([3]) }),
      centralDirectorySignature,
    ]);
    const entry = await openStoredZip(streamOf(archive));
    await expect(readAll(entry.body)).rejects.toThrow(UNEXPECTED);
  });

  it('errors the body when the archive ends before the entry bytes do', async () => {
    const archive = localEntry({ name: 'a.jpg', data: new Uint8Array([1, 2, 3, 4]) });
    const entry = await openStoredZip(streamOf(archive.subarray(0, archive.length - 2)));
    await expect(readAll(entry.body)).rejects.toThrow(UNEXPECTED);
  });

  it('errors the body and cancels the source when the CRC does not match', async () => {
    const archive = Buffer.concat([
      localEntry({ name: 'a.jpg', data: new Uint8Array([1, 2, 3]), crc: 0xdeadbeef }),
      centralDirectorySignature,
    ]);
    const { stream, source } = trackedSource(archive, 8);
    const entry = await openStoredZip(stream);
    await expect(readAll(entry.body)).rejects.toThrow(`${UNEXPECTED}: CRC mismatch`);
    expect(source.cancelled).toBe(true);
  });

  it('cancels the source when the header is rejected', async () => {
    const archive = Buffer.concat([localEntry({ name: 'a.jpg', data: new Uint8Array([1]), method: 8 }), centralDirectorySignature]);
    const { stream, source } = trackedSource(archive, 8);
    await expect(openStoredZip(stream)).rejects.toThrow(UNEXPECTED);
    expect(source.cancelled).toBe(true);
  });

  it('cancels the source when the body errors on a second local header', async () => {
    const archive = Buffer.concat([
      localEntry({ name: 'a.jpg', data: new Uint8Array([1, 2]) }),
      localEntry({ name: 'b.jpg', data: new Uint8Array([3]) }),
      centralDirectorySignature,
    ]);
    const { stream, source } = trackedSource(archive, 8);
    const entry = await openStoredZip(stream);
    await expect(readAll(entry.body)).rejects.toThrow(UNEXPECTED);
    expect(source.cancelled).toBe(true);
  });

  it('cancels the source when the consumer cancels the body midway', async () => {
    const { stream, source } = trackedSource(fixture, 1000);
    const reader = (await openStoredZip(stream)).body.getReader();
    await reader.read();
    await reader.cancel();
    expect(source.cancelled).toBe(true);
  });

  it('cancels the source after the entry is fully read, leaving the central directory unread', async () => {
    const { stream, source } = trackedSource(fixture, 1000);
    const entry = await openStoredZip(stream);
    expect(await readAll(entry.body)).toEqual(fixtureContent);
    expect(source.cancelled).toBe(true);
  });
});
