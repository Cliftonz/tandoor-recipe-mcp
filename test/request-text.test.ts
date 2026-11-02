import { describe, it, expect, afterEach } from 'vitest';
import { BaseClient } from '../src/clients/base.js';
import { startStub, type Stub } from './helpers/stub-http.js';

class TextClient extends BaseClient {
  text(endpoint: string, options?: RequestInit): Promise<string> {
    return this.requestText(endpoint, options);
  }
}

let stub: Stub;

afterEach(async () => {
  await stub?.close();
});

describe('requestText', () => {
  it('sends a POST that gets a 503 exactly once', async () => {
    let hits = 0;
    stub = await startStub((_req, res) => {
      hits++;
      res.writeHead(503);
      res.end();
    });

    const client = new TextClient({ url: stub.url, token: 'tok-test' });
    await expect(client.text('/api/thing/', { method: 'POST', body: '{}' })).rejects.toThrow('Tandoor API error: 503');
    expect(hits).toBe(1);
  });

  it('puts the body detail and the 500 guidance in the error', async () => {
    stub = await startStub((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'calendar export exploded' }));
    });

    const client = new TextClient({ url: stub.url, token: 'tok-test' });
    await expect(client.text('/api/meal-plan/ical/')).rejects.toThrow(
      'Tandoor API error: 500 Internal Server Error\nDetail: calendar export exploded\n\nServer error. Please check your Tandoor instance logs for details.'
    );
  });
});
