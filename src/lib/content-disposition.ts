const ENCODED_WORD = /=\?utf-8\?([bq])\?([^?]*)\?=/gi;
const EXTENDED = /\bfilename\*\s*=\s*utf-8''([^;\s]+)/i;
const QUOTED = /\bfilename\s*=\s*"((?:[^"\\]|\\.)*)"/i;
const TOKEN = /\bfilename\s*=\s*([^;\s"]+)/i;

function decodeWord(_word: string, encoding: string, text: string): string {
  if (encoding.toLowerCase() === 'b') return Buffer.from(text, 'base64').toString('utf8');
  const bytes = text.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_hex, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return Buffer.from(bytes, 'latin1').toString('utf8');
}

function decodeExtended(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

export function dispositionFilename(header: string | null): string {
  const value = (header ?? '').replace(ENCODED_WORD, decodeWord);
  const extended = value.match(EXTENDED);
  const decoded = extended ? decodeExtended(extended[1]) : '';
  if (decoded) return decoded;
  const quoted = value.match(QUOTED);
  if (quoted) return quoted[1].replace(/\\(.)/g, '$1');
  return value.match(TOKEN)?.[1] ?? '';
}
