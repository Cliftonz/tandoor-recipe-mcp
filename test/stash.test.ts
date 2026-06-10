import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getStashConfig,
  stashPut,
  stashGet,
  stashStats,
  shouldStash,
  _stashClear,
  _resetEnvWarnings,
} from '../src/lib/stash.js';
import { useStashEnv } from './helpers/stash-env.js';

useStashEnv();

beforeEach(() => {
  _stashClear();
  _resetEnvWarnings();
});
afterEach(() => {
  _stashClear();
});

describe('stash config', () => {
  it('defaults are on + 25KB + 32 entries + 10min TTL + 32MB byte budget', () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    delete process.env.TANDOOR_MCP_STASH_THRESHOLD;
    delete process.env.TANDOOR_MCP_STASH_MAX_ENTRIES;
    delete process.env.TANDOOR_MCP_STASH_MAX_BYTES;
    delete process.env.TANDOOR_MCP_STASH_TTL_MS;
    const cfg = getStashConfig();
    expect(cfg).toEqual({
      enabled: true,
      thresholdBytes: 25_000,
      maxEntries: 32,
      maxBytes: 32_000_000,
      ttlMs: 600_000,
    });
  });

  it('explicit falsy values opt out', () => {
    for (const v of ['0', 'false', 'FALSE', 'no', 'off', 'disabled']) {
      process.env.TANDOOR_MCP_STASH_ENABLED = v;
      expect(getStashConfig().enabled).toBe(false);
    }
  });

  it('explicit truthy values stay on', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on', 'enabled']) {
      process.env.TANDOOR_MCP_STASH_ENABLED = v;
      expect(getStashConfig().enabled).toBe(true);
    }
  });

  it('unrecognized truthy-ish values default to enabled and warn once', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      process.env.TANDOOR_MCP_STASH_ENABLED = 'maybe';
      expect(getStashConfig().enabled).toBe(true);
      // Second call within same process: warn only once.
      getStashConfig();
      const warnHits = spy.mock.calls.filter((c) =>
        String(c[0]).includes('TANDOOR_MCP_STASH_ENABLED'),
      );
      expect(warnHits.length).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('whitespace / empty string for ENABLED defaults to true', () => {
    process.env.TANDOOR_MCP_STASH_ENABLED = '';
    expect(getStashConfig().enabled).toBe(true);
    process.env.TANDOOR_MCP_STASH_ENABLED = '   ';
    expect(getStashConfig().enabled).toBe(true);
  });

  it('invalid numeric env values fall back to defaults and warn once per var', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const v of ['abc', '0', '-5', '1.9', '10min']) {
        process.env.TANDOOR_MCP_STASH_THRESHOLD = v;
        expect(getStashConfig().thresholdBytes).toBe(25_000);
      }
      const hits = spy.mock.calls.filter((c) =>
        String(c[0]).includes('TANDOOR_MCP_STASH_THRESHOLD'),
      );
      expect(hits.length).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('valid numeric env values are honored across all three caps', () => {
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';
    process.env.TANDOOR_MCP_STASH_MAX_ENTRIES = '4';
    process.env.TANDOOR_MCP_STASH_MAX_BYTES = '1000';
    process.env.TANDOOR_MCP_STASH_TTL_MS = '60000';
    const cfg = getStashConfig();
    expect(cfg.thresholdBytes).toBe(500);
    expect(cfg.maxEntries).toBe(4);
    expect(cfg.maxBytes).toBe(1000);
    expect(cfg.ttlMs).toBe(60_000);
  });
});

describe('shouldStash', () => {
  it('returns false when explicitly disabled', () => {
    const cfg = { ...getStashConfig(), enabled: false, thresholdBytes: 10 };
    expect(shouldStash({ x: 1 }, 1_000_000, cfg)).toBe(false);
  });

  it('returns true when on and over threshold (strict)', () => {
    const cfg = { ...getStashConfig(), enabled: true, thresholdBytes: 5 };
    expect(shouldStash({ x: 1 }, 5, cfg)).toBe(false);
    expect(shouldStash({ x: 1 }, 6, cfg)).toBe(true);
  });

  it('refuses non-object structured values regardless of size', () => {
    const cfg = { ...getStashConfig(), enabled: true, thresholdBytes: 1 };
    expect(shouldStash('a string', 9999, cfg)).toBe(false);
    expect(shouldStash(null, 9999, cfg)).toBe(false);
    expect(shouldStash(42, 9999, cfg)).toBe(false);
    expect(shouldStash([1, 2, 3], 9999, cfg)).toBe(true); // arrays count
    expect(shouldStash({ a: 1 }, 9999, cfg)).toBe(true);
  });
});

describe('stash put/get round-trip', () => {
  it('returns the same text by handle', () => {
    const cfg = getStashConfig();
    const text = '{"results":[{"id":1},{"id":2}]}';
    const entry = stashPut(text, cfg);
    expect(entry.id).toMatch(/^stash_/);
    expect(entry.size).toBe(Buffer.byteLength(text, 'utf8'));
    const got = stashGet(entry.id, cfg);
    expect(got?.text).toBe(text);
  });

  it('unknown handle returns undefined', () => {
    expect(stashGet('stash_does-not-exist', getStashConfig())).toBeUndefined();
  });

  it('handle uses uuid format matching the tool schema regex', () => {
    const entry = stashPut('{"a":1}', getStashConfig());
    expect(entry.id).toMatch(/^stash_[0-9a-f-]{36}$/);
  });
});

describe('LRU eviction by entry count', () => {
  it('drops oldest when over maxEntries', () => {
    process.env.TANDOOR_MCP_STASH_MAX_ENTRIES = '2';
    const cfg = getStashConfig();
    const a = stashPut('{"a":1}', cfg);
    const b = stashPut('{"b":2}', cfg);
    const c = stashPut('{"c":3}', cfg);
    expect(stashGet(a.id, cfg)).toBeUndefined();
    expect(stashGet(b.id, cfg)?.text).toBe('{"b":2}');
    expect(stashGet(c.id, cfg)?.text).toBe('{"c":3}');
  });

  it('get refreshes recency so the touched entry survives', () => {
    process.env.TANDOOR_MCP_STASH_MAX_ENTRIES = '2';
    const cfg = getStashConfig();
    const a = stashPut('{"a":1}', cfg);
    const b = stashPut('{"b":2}', cfg);
    stashGet(a.id, cfg); // touch a, now b is oldest
    stashPut('{"c":3}', cfg);
    expect(stashGet(a.id, cfg)?.text).toBe('{"a":1}');
    expect(stashGet(b.id, cfg)).toBeUndefined();
  });
});

describe('byte-budget eviction', () => {
  it('drops oldest until totalBytes ≤ maxBytes', () => {
    process.env.TANDOOR_MCP_STASH_MAX_ENTRIES = '100';
    process.env.TANDOOR_MCP_STASH_MAX_BYTES = '120';
    const cfg = getStashConfig();
    const a = stashPut('a'.repeat(50), cfg); // 50
    const b = stashPut('b'.repeat(50), cfg); // 100
    const c = stashPut('c'.repeat(50), cfg); // 150 → drop a
    expect(stashGet(a.id, cfg)).toBeUndefined();
    expect(stashGet(b.id, cfg)?.text.length).toBe(50);
    expect(stashGet(c.id, cfg)?.text.length).toBe(50);
    expect(stashStats().bytes).toBe(100);
  });

  it('rejects a single entry larger than maxBytes', () => {
    process.env.TANDOOR_MCP_STASH_MAX_BYTES = '100';
    const cfg = getStashConfig();
    expect(() => stashPut('x'.repeat(500), cfg)).toThrow(/exceeds maxBytes/);
    expect(stashStats().count).toBe(0);
  });
});

describe('TTL expiry', () => {
  it('expired entry returns undefined and is removed (get-time sweep)', async () => {
    process.env.TANDOOR_MCP_STASH_TTL_MS = '20';
    const cfg = getStashConfig();
    const e = stashPut('{"x":1}', cfg);
    await new Promise((r) => setTimeout(r, 40));
    expect(stashGet(e.id, cfg)).toBeUndefined();
    expect(stashStats().count).toBe(0);
  });

  it('put-time sweep purges unread expired entries', async () => {
    process.env.TANDOOR_MCP_STASH_TTL_MS = '20';
    const cfg = getStashConfig();
    stashPut('{"a":1}', cfg);
    await new Promise((r) => setTimeout(r, 40));
    stashPut('{"b":2}', cfg);
    // The first entry was never read but the put-time sweep dropped it.
    expect(stashStats().count).toBe(1);
  });
});

describe('stashStats', () => {
  it('reports count and total bytes accurately after puts and evictions', () => {
    const cfg = getStashConfig();
    stashPut('aaa', cfg); // 3
    stashPut('bbbbb', cfg); // 5
    expect(stashStats()).toEqual({ count: 2, bytes: 8 });
  });

  it('multibyte string size measured in bytes not chars', () => {
    const cfg = { ...getStashConfig(), thresholdBytes: 5 };
    // 'é' is 2 bytes in UTF-8; 3 chars × 2 bytes = 6 bytes > 5.
    expect(shouldStash({ x: 1 }, Buffer.byteLength('ééé', 'utf8'), cfg)).toBe(true);
  });
});
