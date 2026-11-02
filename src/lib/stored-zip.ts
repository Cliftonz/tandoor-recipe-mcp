import { crc32 } from 'node:zlib';

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const LOCAL_HEADER_LENGTH = 30;
const FLAGS_OFFSET = 6;
const METHOD_OFFSET = 8;
const CRC_OFFSET = 14;
const COMPRESSED_SIZE_OFFSET = 18;
const NAME_LENGTH_OFFSET = 26;
const EXTRA_LENGTH_OFFSET = 28;
const STORED_METHOD = 0;
const DATA_DESCRIPTOR_FLAG = 0x08;
const UNEXPECTED_ARCHIVE = 'unexpected archive from Tandoor download-file';

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export async function openStoredZip(
  zip: ReadableStream<Uint8Array>,
): Promise<{ name: string; size: number; body: ReadableStream<Uint8Array> }> {
  const reader = zip.getReader();
  let buffered: Uint8Array = new Uint8Array(0);

  const fail = async (message = UNEXPECTED_ARCHIVE): Promise<never> => {
    await reader.cancel(message);
    throw new Error(message);
  };
  const fill = async (length: number) => {
    while (buffered.length < length) {
      const chunk = await reader.read();
      if (chunk.done) await fail();
      else buffered = Buffer.concat([buffered, chunk.value]);
    }
  };
  const take = async (length: number) => {
    await fill(length);
    const taken = buffered.subarray(0, length);
    buffered = buffered.subarray(length);
    return taken;
  };

  const header = view(await take(LOCAL_HEADER_LENGTH));
  if (
    header.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE ||
    header.getUint16(METHOD_OFFSET, true) !== STORED_METHOD ||
    header.getUint16(FLAGS_OFFSET, true) & DATA_DESCRIPTOR_FLAG
  ) {
    await fail();
  }
  const expectedCrc = header.getUint32(CRC_OFFSET, true);
  const size = header.getUint32(COMPRESSED_SIZE_OFFSET, true);
  let remaining = size;
  const name = new TextDecoder().decode(await take(header.getUint16(NAME_LENGTH_OFFSET, true)));
  await take(header.getUint16(EXTRA_LENGTH_OFFSET, true));

  let crc = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (remaining === 0) {
        if (crc !== expectedCrc) await fail(`${UNEXPECTED_ARCHIVE}: CRC mismatch`);
        if (view(await take(4)).getUint32(0, true) === LOCAL_HEADER_SIGNATURE) await fail();
        await reader.cancel();
        controller.close();
        return;
      }
      await fill(1);
      const bytes = await take(Math.min(buffered.length, remaining));
      remaining -= bytes.length;
      crc = crc32(bytes, crc);
      controller.enqueue(bytes);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return { name, size, body };
}
