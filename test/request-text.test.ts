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
  it.each([502, 503, 504])('sends a POST that gets a %i exactly once', async (status) => {
    let hits = 0;
    stub = await startStub((_req, res) => {
      hits++;
      res.writeHead(status);
      res.end();
    });

    const client = new TextClient({ url: stub.url, token: 'tok-test' });
    await expect(client.text('/api/thing/', { method: 'POST', body: '{}' })).rejects.toThrow(`Tandoor API error: ${status}`);
    expect(hits).toBe(1);
  });

  it('replays a GET after a 503 and returns the recovered body', async () => {
    let hits = 0;
    stub = await startStub((_req, res) => {
      hits++;
      if (hits === 1) {
        res.writeHead(503, { 'Retry-After': '0' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/calendar' });
      res.end('BEGIN:VCALENDAR');
    });

    const client = new TextClient({ url: stub.url, token: 'tok-test' });
    await expect(client.text('/api/meal-plan/ical/')).resolves.toBe('BEGIN:VCALENDAR');
    expect(hits).toBe(2);
  });

  it('puts a non-JSON error body in the error as raw text', async () => {
    stub = await startStub((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<html><body>Internal Server Error</body></html>');
    });

    const client = new TextClient({ url: stub.url, token: 'tok-test' });
    await expect(client.text('/api/meal-plan/ical/')).rejects.toThrow(
      'Tandoor API error: 500 Internal Server Error\n<html><body>Internal Server Error</body></html>\n\nServer error.'
    );
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
