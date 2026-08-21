import { randomBytes } from 'node:crypto';

export type HttpLogLevel = 'info' | 'warn' | 'error';

export function mintReqId(): string {
  return randomBytes(4).toString('hex');
}

export function httpLog(
  reqId: string,
  level: HttpLogLevel,
  event: string,
  meta?: Record<string, string | number | boolean | undefined>,
): void {
  const parts: string[] = [
    '[tandoor-mcp] http',
    `reqId=${reqId}`,
    `level=${level}`,
    `event=${event}`,
  ];
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined) continue;
      parts.push(`${k}=${v}`);
    }
  }
  process.stderr.write(parts.join(' ') + '\n');
}
