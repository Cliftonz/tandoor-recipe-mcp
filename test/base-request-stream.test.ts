import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { BaseClient as BaseClientType } from '../src/clients/base.js';
import { startStub, type Stub } from './helpers/stub-http.js';

type StreamClient = BaseClientType & {
  stream(endpoint: string, opts?: { signal?: AbortSignal }): Promise<Response>;
  json(endpoint: string): Promise<unknown>;
};

let makeClient: (url: string, token?: string) => StreamClient;
let stub: Stub;

beforeAll(async () => {
  process.env.TANDOOR_MCP_LOG = 'all';
  vi.resetModules();
  const { BaseClient } = await import('../src/clients/base.js');
  class TestClient extends BaseClient {
    stream(endpoint: string, opts?: { signal?: AbortSignal }): Promise<Response> {
      return (this as any).requestStream(endpoint, opts);
    }
    json(endpoint: string): Promise<unknown> {
      return (this as any).request(endpoint);
    }
  }
  makeClient = (url, token = 'tok-test') => new TestClient({ url, token });
});

afterAll(() => {
  delete process.env.TANDOOR_MCP_LOG;
  vi.resetModules();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await stub?.close();
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a]);

async function bytesOf(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

function stderrOf(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((c) => String(c[0])).join('\n');
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

  it('adds the request() guidance text to a 404', async () => {
    stub = await startStub((_req, res) => {
      res.writeHead(404, 'Not Found');
      res.end();
    });

    await expect(makeClient(stub.url).stream('/media/missing')).rejects.toThrow(
      'Tandoor API error: 404 Not Found\n\nResource not found. Please check the ID or URL is correct.',
    );
  });

  it.each([
    [401, 'Unauthorized', "Authentication failed. Please check your TANDOOR_TOKEN (or the plugin's Tandoor API Token setting) is valid."],
    [403, 'Forbidden', 'Access forbidden. Your API token may not have the required permissions.'],
    [404, 'Not Found', 'Resource not found. Please check the ID or URL is correct.'],
    [500, 'Internal Server Error', 'Server error. Please check your Tandoor instance logs for details.'],
  ])('keeps request() guidance for a %i byte-identical', async (status, statusText, guidance) => {
    stub = await startStub((_req, res) => {
      res.writeHead(status, statusText);
      res.end();
    });

    const error = await makeClient(stub.url).json('/api/thing/').catch((e: Error) => e);

    expect((error as Error).message).toBe(`Tandoor API error: ${status} ${statusText}\n\n${guidance}`);
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

  it('rejects after DEFAULT_MAX_RETRIES + 1 attempts when every response is a 503', async () => {
    let hits = 0;
    stub = await startStub((_req, res) => {
      hits++;
      res.writeHead(503, { 'Retry-After': '0' });
      res.end();
    });

    await expect(makeClient(stub.url).stream('/media/pic.png')).rejects.toThrow('Tandoor API error: 503');
    expect(hits).toBe(4);
  });

  it('cancels the body of a retried response before the next attempt', async () => {
    let hits = 0;
    let firstClosedBeforeRetry = false;
    let firstResponse: { end(): void } | undefined;
    let firstClosed = false;
    stub = await startStub((_req, res) => {
      hits++;
      if (hits === 1) {
        firstResponse = res;
        res.on('close', () => { firstClosed = true; });
        res.writeHead(503, { 'Retry-After': '0' });
        res.write('partial');
        return;
      }
      firstClosedBeforeRetry = firstClosed;
      res.end(PNG);
    });

    const response = await makeClient(stub.url).stream('/media/pic.png');
    firstResponse!.end();

    expect(await bytesOf(response)).toEqual(PNG);
    expect(firstClosedBeforeRetry).toBe(true);
  });

  it('rejects with a 3xx as a refused redirect without following it', async () => {
    const paths: string[] = [];
    stub = await startStub((req, res) => {
      paths.push(req.url!);
      res.writeHead(302, { Location: '/elsewhere' });
      res.end();
    });

    await expect(makeClient(stub.url).stream('/media/pic.png')).rejects.toThrow('Tandoor redirected a file download');
    expect(paths).toEqual(['/media/pic.png']);
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
    expect(stderrOf(errSpy)).toContain(`✗ GET ${stub.url}/media/pic.png fetch failed`);
  });

  it('wraps a connection failure after DEFAULT_MAX_RETRIES + 1 dropped attempts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    let hits = 0;
    stub = await startStub((req) => {
      hits++;
      req.socket.destroy();
    });

    const settled = makeClient(stub.url, 'tok-secret').stream('/media/pic.png').catch((e: Error) => e);
    for (let backoff = 0; backoff < 3; backoff++) {
      await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
      vi.runOnlyPendingTimers();
    }

    expect((await settled).message).toBe("Failed to connect to Tandoor: fetch failed\nPlease check TANDOOR_URL (or the plugin's Tandoor URL setting) is correct and the server is accessible.");
    expect(hits).toBe(4);
  });

  it('wraps a request() connection failure naming the URL setting both ways', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    stub = await startStub((req) => {
      req.socket.destroy();
    });

    const settled = makeClient(stub.url, 'tok-secret').json('/api/thing/').catch((e: Error) => e);
    for (let backoff = 0; backoff < 3; backoff++) {
      await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
      vi.runOnlyPendingTimers();
    }

    expect((await settled).message).toBe("Failed to connect to Tandoor: fetch failed\nPlease check TANDOOR_URL (or the plugin's Tandoor URL setting) is correct and the server is accessible.");
  });

  it('rejects without contacting Tandoor when the signal is already aborted', async () => {
    let hits = 0;
    stub = await startStub((_req, res) => {
      hits++;
      res.end();
    });
    const ac = new AbortController();
    ac.abort();

    await expect(makeClient(stub.url).stream('/media/pic.png', { signal: ac.signal })).rejects.toBe(ac.signal.reason);
    expect(hits).toBe(0);
  });

  it('rejects promptly when aborted during a retry backoff', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    let hits = 0;
    stub = await startStub((_req, res) => {
      hits++;
      res.writeHead(503, { 'Retry-After': '30' });
      res.end();
    });
    const ac = new AbortController();

    const call = makeClient(stub.url).stream('/media/pic.png', { signal: ac.signal });
    const settled = call.catch((e: unknown) => e);
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
    ac.abort();

    expect(await settled).toBe(ac.signal.reason);
    expect(hits).toBe(1);
  });

  it('logs the request and error response with the token redacted', async () => {
    stub = await startStub((_req, res) => {
      res.writeHead(500);
      res.end('boom tok-secret');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(makeClient(stub.url, 'tok-secret').stream('/media/pic.png')).rejects.toThrow('Tandoor API error: 500');

    const stderr = stderrOf(errSpy);
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
