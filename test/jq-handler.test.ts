import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TandoorClient } from '../src/clients/index.js';
import { getStashConfig, stashPut, _stashClear } from '../src/lib/stash.js';

// Mock the worker-backed runner so unit tests don't spawn worker_threads
// and don't load the WASM. The real-WASM path is exercised in
// stash-jq-e2e.test.ts.
vi.mock('../src/lib/jq-runner.js', () => {
  return {
    JQ_TIMEOUT_MS: 5000,
    JQ_MAX_OUTPUT_BYTES: 5_000_000,
    runJq: vi.fn(async (input: string, filter: string) => {
      const data = JSON.parse(input);
      if (filter === '.results | length') {
        return { stdout: `${data.results.length}\n`, stderr: '', exitCode: 0 };
      }
      if (filter === '.results | map(.id)') {
        const ids = data.results.map((r: any) => r.id);
        return { stdout: `${JSON.stringify(ids)}\n`, stderr: '', exitCode: 0 };
      }
      if (filter === '.results[]') {
        const lines = data.results.map((r: any) => JSON.stringify(r)).join('\n') + '\n';
        return { stdout: lines, stderr: '', exitCode: 0 };
      }
      if (filter === 'empty') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (filter === 'debug-filter') {
        // Successful jq run that wrote to stderr (e.g. `debug`). Used to be
        // a hard failure; now it succeeds and stderr is surfaced via the
        // trace log instead.
        return { stdout: '1\n', stderr: '["DEBUG:",1]', exitCode: 0 };
      }
      if (filter === 'badfilter') {
        return { stdout: '', stderr: 'jq: error: syntax', exitCode: 3 };
      }
      return { stdout: 'null\n', stderr: '', exitCode: 0 };
    }),
    _resetJqWorker: vi.fn(async () => {}),
  };
});

// IMPORTANT: dynamic import after the mock is registered.
const { handleJqQuery, handleJqStashStats } = await import('../src/handlers/jq.js');

const client = new TandoorClient({ url: 'https://x.test', token: 'x' });

beforeEach(() => {
  _stashClear();
});
afterEach(() => {
  _stashClear();
});

function put(text: string): string {
  return stashPut(text, getStashConfig()).id;
}

describe('handleJqQuery', () => {
  it('returns scalar count for .results | length', async () => {
    const id = put('{"results":[{"id":1},{"id":2},{"id":3}]}');
    const out = await handleJqQuery(client, { handle: id, filter: '.results | length' });
    expect(out).toBe('3');
  });

  it('returns an array for map(.id)', async () => {
    const id = put('{"results":[{"id":5},{"id":6}]}');
    const out = await handleJqQuery(client, { handle: id, filter: '.results | map(.id)' });
    expect(JSON.parse(out)).toEqual([5, 6]);
  });

  it('wraps multi-line jq output in a JSON array', async () => {
    const id = put('{"results":[{"id":1},{"id":2}]}');
    const out = await handleJqQuery(client, { handle: id, filter: '.results[]' });
    expect(JSON.parse(out)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('empty jq output returns "null" (valid JSON value)', async () => {
    const id = put('{"results":[]}');
    const out = await handleJqQuery(client, { handle: id, filter: 'empty' });
    expect(out).toBe('null');
    expect(JSON.parse(out)).toBeNull();
  });

  it('stderr-with-exit-0 succeeds (debug filters not treated as errors)', async () => {
    const id = put('{"results":[]}');
    const out = await handleJqQuery(client, { handle: id, filter: 'debug-filter' });
    expect(out).toBe('1');
  });

  it('throws on unknown handle with a generic message (no echo)', async () => {
    const handle = 'stash_00000000-0000-0000-0000-000000000000';
    await expect(
      handleJqQuery(client, { handle, filter: '.' }),
    ).rejects.toThrow(/not found or expired/);
    // The user-supplied handle must NOT be echoed back into the error text.
    await expect(
      handleJqQuery(client, { handle, filter: '.' }),
    ).rejects.not.toThrow(new RegExp(handle));
  });

  it('throws on jq filter error (exit code non-zero)', async () => {
    const id = put('{"results":[]}');
    await expect(
      handleJqQuery(client, { handle: id, filter: 'badfilter' }),
    ).rejects.toThrow(/jq: error: syntax/);
  });
});

describe('handleJqStashStats', () => {
  it('reports stash size', async () => {
    const cfg = getStashConfig();
    stashPut('{"a":1}', cfg);
    stashPut('{"bb":22}', cfg);
    const out = await handleJqStashStats(client, {} as Record<string, never>);
    const parsed = JSON.parse(out);
    expect(parsed.count).toBe(2);
    expect(parsed.bytes).toBe(Buffer.byteLength('{"a":1}') + Buffer.byteLength('{"bb":22}'));
  });
});
