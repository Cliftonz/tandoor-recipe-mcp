const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_FLAG = 0x08;

export interface StoredZipEntry {
  name: string;
  body: ReadableStream<Uint8Array>;
}

const unexpectedArchive = () => new Error('unexpected archive from Tandoor download-file');
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export async function openStoredZip(zip: ReadableStream<Uint8Array>): Promise<StoredZipEntry> {
  const reader = zip.getReader();
  let buffered: Uint8Array = new Uint8Array(0);

  const fill = async (length: number) => {
    while (buffered.length < length) {
      const chunk = await reader.read();
      if (chunk.done) throw unexpectedArchive();
      buffered = Buffer.concat([buffered, chunk.value]);
    }
  };
  const take = async (length: number) => {
    await fill(length);
    const taken = buffered.subarray(0, length);
    buffered = buffered.subarray(length);
    return taken;
  };

  const header = view(await take(30));
  const flags = header.getUint16(6, true);
  let remaining = header.getUint32(18, true);
  if (
    header.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE ||
    header.getUint16(8, true) !== 0 ||
    (flags & DATA_DESCRIPTOR_FLAG && remaining === 0)
  ) {
    throw unexpectedArchive();
  }
  const name = new TextDecoder().decode(await take(header.getUint16(26, true)));
  await take(header.getUint16(28, true));

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (remaining === 0) {
        if (view(await take(4)).getUint32(0, true) === LOCAL_HEADER_SIGNATURE) throw unexpectedArchive();
        await reader.cancel();
        controller.close();
        return;
      }
      await fill(1);
      const bytes = await take(Math.min(buffered.length, remaining));
      remaining -= bytes.length;
      controller.enqueue(bytes);
    },
  });
  return { name, body };
}
