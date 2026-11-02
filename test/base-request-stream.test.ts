import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { BaseClient as BaseClientType } from '../src/clients/base.js';
import { startStub, type Stub } from './helpers/stub-http.js';

type StreamClient = BaseClientType & { stream(endpoint: string, options?: RequestInit): Promise<Response> };

let makeClient: (url: string, token?: string) => StreamClient;
let stub: Stub;

beforeAll(async () => {
  process.env.TANDOOR_MCP_LOG = 'all';
  vi.resetModules();
  const { BaseClient } = await import('../src/clients/base.js');
  class TestClient extends BaseClient {
    stream(endpoint: string, options: RequestInit = {}): Promise<Response> {
      return (this as any).requestStream(endpoint, options);
    }
  }
  makeClient = (url, token = 't') => new TestClient({ url, token });
});

afterAll(() => {
  delete process.env.TANDOOR_MCP_LOG;
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await stub?.close();
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a]);

async function bytesOf(response: Response): Promise<Buffer> {
  return Buffer.from(await new Response(response.body).arrayBuffer());
}

describe('requestStream', () => {
  it('returns the raw body bytes and the download headers', async () => {
    stub = await startStub((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="pic.png"',
        'Content-Length': String(PNG.length),
      });
      res.end(PNG);
    });

    const response = await makeClient(stub.url).stream('/media/pic.png');

    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="pic.png"');
    expect(response.headers.get('content-length')).toBe(String(PNG.length));
    expect(await bytesOf(response)).toEqual(PNG);
  });

  it('sends the bearer token', async () => {
    let auth: string | undefined;
    stub = await startStub((req, res) => {
      auth = req.headers.authorization;
      res.end();
    });

    await makeClient(stub.url, 'tok-abc').stream('/media/x');

    expect(auth).toBe('Bearer tok-abc');
  });

  it('throws a redacted Tandoor API error on a non-2xx response', async () => {
    stub = await startStub((_req, res) => {
      res.writeHead(404, 'Missing tok-secret');
      res.end('nope');
    });

    const call = makeClient(stub.url, 'tok-secret').stream('/media/missing');

    await expect(call).rejects.toThrow('Tandoor API error: 404 Missing ***REDACTED***');
    await expect(call).rejects.not.toThrow('tok-secret');
  });

  it('replays a GET after a 503 and returns the recovered body', async () => {
    const received: string[] = [];
    stub = await startStub((req, res) => {
      received.push(req.method!);
      res.writeHead(received.length === 1 ? 503 : 200, { 'Retry-After': '0' });
      res.end(received.length === 1 ? 'down' : PNG);
    });

    const response = await makeClient(stub.url).stream('/media/pic.png');

    expect(await bytesOf(response)).toEqual(PNG);
    expect(received).toEqual(['GET', 'GET']);
  });

  it('sends a POST that gets a 503 exactly once', async () => {
    const received: string[] = [];
    stub = await startStub((req, res) => {
      received.push(req.method!);
      res.writeHead(503, { 'Retry-After': '0' });
      res.end();
    });

    await expect(makeClient(stub.url).stream('/api/export/', { method: 'POST' })).rejects.toThrow('Tandoor API error: 503');
    expect(received).toEqual(['POST']);
  });

  it('retries after a dropped connection', async () => {
    let hits = 0;
    stub = await startStub((req, res) => {
      hits++;
      if (hits === 1) {
        req.socket.destroy();
        return;
      }
      res.end(PNG);
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await makeClient(stub.url).stream('/media/pic.png');

    expect(await bytesOf(response)).toEqual(PNG);
    expect(hits).toBe(2);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain(`✗ GET ${stub.url}/media/pic.png fetch failed`);
  });

  it('rejects without contacting Tandoor when the signal is already aborted', async () => {
    let hits = 0;
    stub = await startStub((_req, res) => {
      hits++;
      res.end();
    });
    const ac = new AbortController();
    ac.abort();

    await expect(makeClient(stub.url).stream('/media/pic.png', { signal: ac.signal })).rejects.toThrow();
    expect(hits).toBe(0);
  });

  it('logs the request and error response with the token redacted', async () => {
    stub = await startStub((_req, res) => {
      res.writeHead(500);
      res.end('boom tok-secret');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(makeClient(stub.url, 'tok-secret').stream('/media/pic.png')).rejects.toThrow('Tandoor API error: 500');

    const stderr = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(stderr).toContain(`→ GET ${stub.url}/media/pic.png`);
    expect(stderr).toContain(`← GET ${stub.url}/media/pic.png 500 boom ***REDACTED***`);
    expect(stderr).not.toContain('tok-secret');
  });

  it('logs the status of a successful response', async () => {
    stub = await startStub((_req, res) => res.end(PNG));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await makeClient(stub.url).stream('/media/pic.png');

    expect(errSpy.mock.calls.map((c) => String(c[0]))).toContain(`[tandoor-mcp] ← GET ${stub.url}/media/pic.png 200`);
  });
});
