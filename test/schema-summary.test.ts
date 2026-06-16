import { describe, it, expect } from 'vitest';
import { summarize } from '../src/lib/schema-summary.js';

describe('summarize', () => {
  it('detects Tandoor paginated shape and offers .results filters', () => {
    const payload = {
      count: 50,
      next: 'http://x?page=2',
      previous: null,
      results: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ],
    };
    const s = summarize(payload, 'stash_x', 1234);
    expect(s.stashed).toBe(true);
    expect(s.handle).toBe('stash_x');
    expect(s.size_bytes).toBe(1234);
    expect(s.sample_filters).toContain('.count');
    expect(s.sample_filters).toContain('.results | length');
    expect(s.hint).toMatch(/Tandoor paginated/);
    const shape = s.shape as Record<string, unknown>;
    expect((shape.keys as any).results.type).toBe('array');
    expect((shape.keys as any).results.length).toBe(2);
  });

  it('arrays of objects union keys across first items', () => {
    const arr = [
      { id: 1, name: 'a' },
      { id: 2, label: 'b' },
      { id: 3, name: 'c', extra: true },
    ];
    const s = summarize(arr, 'h', 10);
    const shape = s.shape as any;
    expect(shape.type).toBe('array');
    expect(shape.length).toBe(3);
    expect(Object.keys(shape.item.keys).sort()).toEqual(['extra', 'id', 'label', 'name']);
  });

  it('truncates long strings in samples', () => {
    const longStr = 'x'.repeat(500);
    const s = summarize({ note: longStr }, 'h', 1);
    const shape = s.shape as any;
    expect(shape.keys.note.sample.length).toBeLessThan(longStr.length);
    expect(shape.keys.note.sample.endsWith('…')).toBe(true);
  });

  it('handles scalars', () => {
    const s = summarize(42, 'h', 1);
    expect((s.shape as any).type).toBe('number');
    expect(s.sample_filters).toContain('.');
  });

  it('handles null', () => {
    const s = summarize(null, 'h', 1);
    expect((s.shape as any).type).toBe('null');
  });

  it('caps object keys at 20 and reports _truncated on the wrapper', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 25; i++) obj[`k${i}`] = i;
    const s = summarize(obj, 'h', 1);
    const shape = s.shape as any;
    expect(Object.keys(shape.keys).length).toBe(20);
    expect(shape._truncated).toBe(5);
  });

  it('marks deep nesting beyond MAX_DEPTH as truncated', () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    const s = summarize(deep, 'h', 1);
    const str = JSON.stringify(s.shape);
    expect(str).toMatch(/truncated/);
  });

  it('empty array reports length 0 with no item', () => {
    const s = summarize([], 'h', 1);
    const shape = s.shape as any;
    expect(shape.type).toBe('array');
    expect(shape.length).toBe(0);
    expect(shape.item).toBeUndefined();
    expect(s.sample_filters).toContain('length');
  });

  it('scalar array reports item sketch instead of object key union', () => {
    const s = summarize([1, 2, 3], 'h', 1);
    const shape = s.shape as any;
    expect(shape.item.type).toBe('number');
  });

  it('array of arrays reports nested array item', () => {
    const s = summarize([[1], [2]], 'h', 1);
    const shape = s.shape as any;
    expect(shape.item.type).toBe('array');
  });

  it('caps union-key sample at 20 keys, reports _truncated on item wrapper', () => {
    const item: Record<string, number> = {};
    for (let i = 0; i < 25; i++) item[`k${i}`] = i;
    const s = summarize([item], 'h', 1);
    const shape = s.shape as any;
    expect(Object.keys(shape.item.keys).length).toBe(20);
    expect(shape.item._truncated).toBe(5);
  });

  it('object payload without next/previous falls back to generic Object hint', () => {
    const s = summarize({ results: [{ id: 1 }], count: 1 }, 'h', 1);
    expect(s.hint).toMatch(/Object payload/);
    expect(s.hint).not.toMatch(/Tandoor paginated/);
  });

  it('does not pollute the keys object when payload contains __proto__', () => {
    const evil: Record<string, unknown> = { good: 1 };
    // Set as an own enumerable property so Object.entries sees it.
    Object.defineProperty(evil, '__proto__', {
      value: { poisoned: true },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const s = summarize(evil, 'h', 1);
    const shape = s.shape as any;
    // The sketch must not have its prototype rewritten by the malicious key.
    expect((shape.keys as any).poisoned).toBeUndefined();
    // And the good key still made it in.
    expect(shape.keys.good).toBeDefined();
  });

  it('does not collide with a real upstream key named _truncated', () => {
    const obj: Record<string, unknown> = { _truncated: 'this is real data' };
    for (let i = 0; i < 21; i++) obj[`k${i}`] = i;
    const s = summarize(obj, 'h', 1);
    const shape = s.shape as any;
    // _truncated on the wrapper is the marker count, not the real upstream value.
    expect(typeof shape._truncated).toBe('number');
    // And the real upstream key shows up among the sketched keys.
    expect(shape.keys._truncated).toBeDefined();
  });

  // Defense-in-depth check: schema-summary uses Object.create(null) for any
  // record whose keys come from untrusted upstream JSON, so a payload with
  // `__proto__` (the classic prototype-pollution vector) cannot rewrite the
  // prototype chain of the keys map. Stdio e2e's "proto" mode only proves
  // the server doesn't crash; these tests pin the actual defense — they
  // FAIL if `emptyKeyMap()` is replaced with `() => ({})`.
  describe('prototype-pollution payloads stay confined to own properties', () => {
    // Construct the malicious key via Object.defineProperty so `__proto__`
    // is a real own enumerable data property and survives iteration —
    // JSON.parse silently strips it in modern V8, which would make the
    // earlier-style test useless. This shape models the actual attack
    // vector (a Tandoor-side serializer or middleware that builds the
    // response object programmatically with an attacker-controlled key).
    function withProto<T extends object>(obj: T, value: any): T {
      Object.defineProperty(obj, '__proto__', {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      return obj;
    }

    it('top-level __proto__ own key does not corrupt Object.prototype', () => {
      const malicious = withProto({ a: 1 }, { polluted: 'yes' });
      // Sanity: defineProperty actually attached __proto__ as own key.
      expect(Object.prototype.hasOwnProperty.call(malicious, '__proto__')).toBe(true);
      summarize(malicious, 'h', 1);
      expect(({} as any).polluted).toBeUndefined();
    });

    it('array of objects with __proto__ own keys does not pollute', () => {
      const payload = {
        count: 1,
        next: null,
        previous: null,
        results: [withProto({ id: 1 }, { polluted: true })],
      };
      summarize(payload, 'h', 1);
      expect(({} as any).polluted).toBeUndefined();
    });

    it('summary keys map has null prototype (the Object.create(null) defense)', () => {
      const malicious = withProto({ a: 1 }, { polluted: true });
      const s = summarize(malicious, 'h', 1);
      const shape = s.shape as Record<string, unknown>;
      const keys = (shape as any).keys as Record<string, unknown>;
      // If emptyKeyMap() is changed from Object.create(null) to {}, this
      // assertion fails. That's the regression guard.
      expect(Object.getPrototypeOf(keys)).toBeNull();
    });
  });
});
