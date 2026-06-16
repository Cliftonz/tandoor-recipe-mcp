// Five places independently boot a localhost HTTP stub for tests
// (stdio-protocol-e2e, pack-smoke, upload-handlers, ai-import-handler).
// The listen-on-random-port + address-parse + teardown ceremony is identical
// across them — the discriminating logic is the per-test request handler.
// This helper extracts only the ceremony; the handler stays inline at each
// call site so each test's actual surface is still local + obvious.

import http from 'node:http';

export interface Stub {
  /** `http://127.0.0.1:<port>` */
  url: string;
  /** Closes the underlying server. Awaitable. */
  close(): Promise<void>;
}

/**
 * Boot an http server on a free 127.0.0.1 port, return its URL + a close fn.
 * Caller owns the request handler; this only handles the lifecycle.
 */
export async function startStub(handler: http.RequestListener): Promise<Stub> {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
