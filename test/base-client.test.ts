import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseClient } from '../src/clients/base.js';

// BaseClient is protected — subclass to expose `request` and surface the
// URL/options so we can assert what the client tried to send.
class TestClient extends BaseClient {
  exec<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return (this as any).request(endpoint, options);
  }
}

function fetchOk(body: unknown, init: ResponseInit = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('BaseClient.request', () => {
  const client = new TestClient({ url: 'https://tandoor.test', token: 't0ken' });
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('adds Authorization and JSON Content-Type for regular bodies', async () => {
    fetchSpy.mockResolvedValueOnce(fetchOk({ ok: true }));
    await client.exec('/api/thing/', { method: 'POST', body: JSON.stringify({ a: 1 }) });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://tandoor.test/api/thing/');
    expect((init as any).headers.Authorization).toBe('Bearer t0ken');
    expect((init as any).headers['Content-Type']).toBe('application/json');
  });

  it('omits Content-Type when body is FormData (lets fetch set multipart boundary)', async () => {
    fetchSpy.mockResolvedValueOnce(fetchOk({ ok: true }));
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array([1, 2, 3])]), 'x.bin');
    await client.exec('/api/upload/', { method: 'POST', body: fd });

    const init = fetchSpy.mock.calls[0][1] as any;
    expect(init.headers.Authorization).toBe('Bearer t0ken');
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('returns undefined for 204 responses without attempting to parse', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const r = await client.exec('/api/thing/1/', { method: 'DELETE' });
    expect(r).toBeUndefined();
  });

  it('returns undefined for empty 200 bodies instead of throwing', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));
    const r = await client.exec('/api/thing/');
    expect(r).toBeUndefined();
  });

  it('reads body exactly once on errors (no double-read TypeError)', async () => {
    // Build a Response whose body stream would throw "Body is unusable" if
    // consumed twice. Vitest's Response uses native streams so the contract
    // matches production.
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'nope' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(client.exec('/api/thing/', { method: 'PATCH', body: '{}' })).rejects.toThrow(
      /Tandoor API error: 400[\s\S]*Detail: nope/
    );
  });

  it('includes raw text when error body is not JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('<html>500</html>', { status: 500 }));
    await expect(client.exec('/api/thing/')).rejects.toThrow(/500[\s\S]*<html>/);
  });

  it('normalizes base URL: adds https:// and strips trailing slash', async () => {
    fetchSpy.mockResolvedValueOnce(fetchOk({}));
    const c = new TestClient({ url: 'example.com/', token: 't' });
    await c.exec('/api/ping/');
    expect(fetchSpy.mock.calls[0][0]).toBe('https://example.com/api/ping/');
  });

  it('parses JSON success payloads', async () => {
    fetchSpy.mockResolvedValueOnce(fetchOk({ id: 7, name: 'x' }));
    const r = await client.exec<{ id: number; name: string }>('/api/x/');
    expect(r).toEqual({ id: 7, name: 'x' });
  });

  it('throws a readable error if the server returns non-JSON on success', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    await expect(client.exec('/api/x/')).rejects.toThrow(/non-JSON/);
  });
});
