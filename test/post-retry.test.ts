import { describe, it, expect, afterEach } from 'vitest';
import { BaseClient } from '../src/clients/base.js';
import { startStub, type Stub } from './helpers/stub-http.js';

class TestClient extends BaseClient {
  exec(endpoint: string, options: RequestInit = {}): Promise<unknown> {
    return (this as any).request(endpoint, options);
  }
}

let stub: Stub;

afterEach(async () => {
  await stub.close();
});

async function serveStatusesThenOk(statuses: number[]) {
  const received: string[] = [];
  stub = await startStub((req, res) => {
    received.push(req.method!);
    const status = statuses[received.length - 1] ?? 200;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Retry-After': '0' });
    res.end(JSON.stringify(status === 200 ? { ok: true } : { detail: 'upstream down' }));
  });
  return { client: new TestClient({ url: stub.url, token: 't' }), received };
}

describe('5xx retry by method', () => {
  it('sends a POST that gets a 503 exactly once and surfaces the error', async () => {
    const { client, received } = await serveStatusesThenOk([503]);

    await expect(
      client.exec('/api/auto-plan/', { method: 'POST', body: '{}' }),
    ).rejects.toThrow(/Tandoor API error: 503/);
    expect(received).toEqual(['POST']);
  });

  it.each(['GET', 'PUT', 'DELETE'])('replays a %s after a 503 and returns the recovered response', async (method) => {
    const { client, received } = await serveStatusesThenOk([503]);

    await expect(client.exec('/api/thing/1/', { method })).resolves.toEqual({ ok: true });
    expect(received).toEqual([method, method]);
  });
});
