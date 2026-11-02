import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

function localEntry(opts: { name: string; data: Uint8Array; method?: number; flags?: number; size?: number }): Uint8Array {
  const name = new TextEncoder().encode(opts.name);
  const header = new DataView(new ArrayBuffer(30));
  header.setUint32(0, 0x04034b50, true);
  header.setUint16(4, 20, true);
  header.setUint16(6, opts.flags ?? 0, true);
  header.setUint16(8, opts.method ?? 0, true);
  header.setUint32(18, opts.size ?? opts.data.length, true);
  header.setUint32(22, opts.size ?? opts.data.length, true);
  header.setUint16(26, name.length, true);
  return Buffer.concat([new Uint8Array(header.buffer), name, opts.data]);
}

const centralDirectoryStart = new Uint8Array([0x50, 0x4b, 0x01, 0x02, 0, 0, 0, 0]);

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
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const archive = localEntry({ name: 'a.bin', data });
    const neverEnding = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(archive.subarray(0, archive.length - 4));
      },
    });
    const entry = await openStoredZip(neverEnding);
    const first = await entry.body.getReader().read();
    expect(Array.from(first.value ?? [])).toEqual([1, 2, 3, 4]);
  });

  it('returns an empty body for a zero-length entry', async () => {
    const archive = Buffer.concat([localEntry({ name: 'empty.txt', data: new Uint8Array(0) }), centralDirectoryStart]);
    const entry = await openStoredZip(streamOf(archive));
    expect(entry.name).toBe('empty.txt');
    expect(await readAll(entry.body)).toEqual(new Uint8Array(0));
  });

  it('rejects a deflated entry', async () => {
    const archive = Buffer.concat([localEntry({ name: 'a.jpg', data: new Uint8Array([1]), method: 8 }), centralDirectoryStart]);
    await expect(openStoredZip(streamOf(archive))).rejects.toThrow(UNEXPECTED);
  });

  it('rejects input without a local file header signature', async () => {
    const archive = Buffer.concat([centralDirectoryStart, new Uint8Array(40)]);
    await expect(openStoredZip(streamOf(archive))).rejects.toThrow(UNEXPECTED);
  });

  it('rejects a data-descriptor entry whose header sizes are zero', async () => {
    const archive = Buffer.concat([
      localEntry({ name: 'a.jpg', data: new Uint8Array([1, 2]), flags: 0x08, size: 0 }),
      centralDirectoryStart,
    ]);
    await expect(openStoredZip(streamOf(archive))).rejects.toThrow(UNEXPECTED);
  });

  it('errors the body when a second local header follows the entry', async () => {
    const archive = Buffer.concat([
      localEntry({ name: 'a.jpg', data: new Uint8Array([1, 2]) }),
      localEntry({ name: 'b.jpg', data: new Uint8Array([3]) }),
      centralDirectoryStart,
    ]);
    const entry = await openStoredZip(streamOf(archive));
    await expect(readAll(entry.body)).rejects.toThrow(UNEXPECTED);
  });

  it('errors the body when the archive ends before the entry bytes do', async () => {
    const archive = localEntry({ name: 'a.jpg', data: new Uint8Array([1, 2, 3, 4]) });
    const entry = await openStoredZip(streamOf(archive.subarray(0, archive.length - 2)));
    await expect(readAll(entry.body)).rejects.toThrow(UNEXPECTED);
  });
});
