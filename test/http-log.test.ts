import { describe, it, expect, vi, afterEach } from 'vitest';
import { httpLog, mintReqId } from '../src/lib/http-log.js';

describe('httpLog', () => {
  const originalWrite = process.stderr.write;
  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  function captureStderr(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const spy = vi.fn((chunk: string | Uint8Array) => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });
    process.stderr.write = spy as unknown as typeof process.stderr.write;
    return { lines, restore: () => { process.stderr.write = originalWrite; } };
  }

  it('writes prefix + reqId + level + event to stderr', () => {
    const cap = captureStderr();
    httpLog('abcd1234', 'info', 'auth_missing');
    cap.restore();
    expect(cap.lines.length).toBe(1);
    expect(cap.lines[0]).toContain('[tandoor-mcp] http');
    expect(cap.lines[0]).toContain('reqId=abcd1234');
    expect(cap.lines[0]).toContain('level=info');
    expect(cap.lines[0]).toContain('event=auth_missing');
    expect(cap.lines[0].endsWith('\n')).toBe(true);
  });

  it('includes meta key=value pairs when provided', () => {
    const cap = captureStderr();
    httpLog('deadbeef', 'warn', 'auth_rate_limited', { remote: '127.0.0.1', tries: 21 });
    cap.restore();
    expect(cap.lines[0]).toContain('remote=127.0.0.1');
    expect(cap.lines[0]).toContain('tries=21');
  });

  it('handles empty or undefined meta', () => {
    const cap = captureStderr();
    httpLog('11112222', 'info', 'not_found');
    httpLog('33334444', 'info', 'not_found', {});
    cap.restore();
    expect(cap.lines.length).toBe(2);
    expect(cap.lines[0]).toContain('event=not_found');
    expect(cap.lines[1]).toContain('event=not_found');
  });
});

describe('mintReqId', () => {
  it('returns an 8-hex-char id', () => {
    const id = mintReqId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces distinct ids on repeated calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) ids.add(mintReqId());
    expect(ids.size).toBeGreaterThan(15);
  });
});
