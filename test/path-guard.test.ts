// Unit tests for the path-guard library — the defense against prompt-injected
// upload_recipe_image / upload_user_file / ai_import_recipe handlers reading
// sensitive paths.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  writeFileSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { realpath } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import {
  assertSafeUploadPath,
  openSafeUpload,
  readSafeUpload,
  getAllowedRoots,
  PathGuardError,
  _resetPathGuardCache,
} from '../src/lib/path-guard.js';

describe('getAllowedRoots — env contract', () => {
  it('defaults to ~/Downloads, ~/Pictures, ~/Documents, tmpdir when unset', () => {
    const roots = getAllowedRoots({});
    const home = homedir();
    expect(roots).toEqual([
      path.join(home, 'Downloads'),
      path.join(home, 'Pictures'),
      path.join(home, 'Documents'),
      tmpdir(),
    ]);
  });

  it('TANDOOR_MCP_UPLOAD_ROOT overrides defaults entirely', () => {
    const env = process.platform === 'win32'
      ? { TANDOOR_MCP_UPLOAD_ROOT: '/a;/b' }
      : { TANDOOR_MCP_UPLOAD_ROOT: '/a:/b' };
    const roots = getAllowedRoots(env);
    expect(roots.map((r) => path.basename(r))).toEqual(['a', 'b']);
  });

  it('expands $HOME and ~ in TANDOOR_MCP_UPLOAD_ROOT', () => {
    const env = process.platform === 'win32'
      ? { TANDOOR_MCP_UPLOAD_ROOT: '~/foo;$HOME/bar' }
      : { TANDOOR_MCP_UPLOAD_ROOT: '~/foo:$HOME/bar' };
    const roots = getAllowedRoots(env);
    const home = homedir();
    expect(roots).toEqual([path.join(home, 'foo'), path.join(home, 'bar')]);
  });

  it('drops blank entries between delimiters', () => {
    const env = process.platform === 'win32'
      ? { TANDOOR_MCP_UPLOAD_ROOT: '/a;;/b' }
      : { TANDOOR_MCP_UPLOAD_ROOT: '/a::/b' };
    const roots = getAllowedRoots(env);
    expect(roots).toEqual([path.resolve('/a'), path.resolve('/b')]);
  });

  it('TANDOOR_MCP_UPLOAD_ROOT="" is explicit deny-all (returns [])', () => {
    expect(getAllowedRoots({ TANDOOR_MCP_UPLOAD_ROOT: '' })).toEqual([]);
  });

  it('whitespace-only TANDOOR_MCP_UPLOAD_ROOT is also deny-all', () => {
    expect(getAllowedRoots({ TANDOOR_MCP_UPLOAD_ROOT: '   ' })).toEqual([]);
  });
});

describe('assertSafeUploadPath', () => {
  let allowed: string;
  let outsideRoot: string;
  let prevRoot: string | undefined;

  beforeEach(() => {
    allowed = mkdtempSync(path.join(tmpdir(), 'pg-allowed-'));
    outsideRoot = mkdtempSync(path.join(tmpdir(), 'pg-outside-'));
    prevRoot = process.env.TANDOOR_MCP_UPLOAD_ROOT;
    process.env.TANDOOR_MCP_UPLOAD_ROOT = allowed;
    _resetPathGuardCache();
  });
  afterEach(() => {
    rmSync(allowed, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.TANDOOR_MCP_UPLOAD_ROOT;
    else process.env.TANDOOR_MCP_UPLOAD_ROOT = prevRoot;
    _resetPathGuardCache();
  });

  it('accepts a real file inside an allowed root and returns ino/dev', async () => {
    const target = path.join(allowed, 'recipe.png');
    writeFileSync(target, 'data');
    const v = await assertSafeUploadPath(target);
    expect(v.safePath).toBe(await realpath(target));
    expect(typeof v.ino).toBe('bigint');
    expect(typeof v.dev).toBe('bigint');
  });

  it('rejects a real file outside every allowed root', async () => {
    const target = path.join(outsideRoot, 'secret');
    writeFileSync(target, 'data');
    await expect(assertSafeUploadPath(target)).rejects.toThrow(PathGuardError);
    await expect(assertSafeUploadPath(target))
      .rejects.toThrow(/outside the allowed upload roots/);
  });

  it.skipIf(process.platform === 'win32')('rejects a symlink that points outside the allow-list', async () => {
    // Windows symlinkSync requires admin / Developer Mode; skip on CI matrix.
    const target = path.join(outsideRoot, 'secret');
    writeFileSync(target, 'data');
    const link = path.join(allowed, 'looks-safe.png');
    symlinkSync(target, link);
    await expect(assertSafeUploadPath(link))
      .rejects.toThrow(/outside the allowed upload roots/);
  });

  it('rejects an empty path with a clear message', async () => {
    await expect(assertSafeUploadPath(''))
      .rejects.toThrow(/non-empty string/);
  });

  it('rejects a non-existent path with a resolution error', async () => {
    await expect(assertSafeUploadPath(path.join(allowed, 'nope')))
      .rejects.toThrow(/could not be resolved/);
  });

  it('error message names the configured roots so the user knows how to fix', async () => {
    const outside = path.join(outsideRoot, 's');
    writeFileSync(outside, 'x');
    try {
      await assertSafeUploadPath(outside);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toContain(await realpath(allowed));
      expect((err as Error).message).toContain('TANDOOR_MCP_UPLOAD_ROOT');
    }
  });
});

describe('assertSafeUploadPath — typo / vanished root handling', () => {
  let allowed: string;
  let prevRoot: string | undefined;
  let consoleSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    allowed = mkdtempSync(path.join(tmpdir(), 'pg-allow-'));
    prevRoot = process.env.TANDOOR_MCP_UPLOAD_ROOT;
    _resetPathGuardCache();
    consoleSpy = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(consoleSpy);
  });
  afterEach(() => {
    rmSync(allowed, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.TANDOOR_MCP_UPLOAD_ROOT;
    else process.env.TANDOOR_MCP_UPLOAD_ROOT = prevRoot;
    _resetPathGuardCache();
    vi.restoreAllMocks();
  });

  it("typo'd root is silently skipped, but a sibling valid root still works", async () => {
    const delim = process.platform === 'win32' ? ';' : ':';
    process.env.TANDOOR_MCP_UPLOAD_ROOT = `${allowed}${delim}/definitely/not/a/path-xyz123`;
    const target = path.join(allowed, 'r.png');
    writeFileSync(target, 'x');
    const v = await assertSafeUploadPath(target);
    expect(v.safePath).toBe(await realpath(target));
    // Operator-visible stderr warning fires exactly once per unreachable root.
    const warns = consoleSpy.mock.calls.filter(c => /upload root unresolvable/.test(String(c[0])));
    expect(warns.length).toBeGreaterThan(0);
  });

  it("every root typo'd → rejection message includes Unreachable section so operator can fix env", async () => {
    const delim = process.platform === 'win32' ? ';' : ':';
    process.env.TANDOOR_MCP_UPLOAD_ROOT = `/typo-a${delim}/typo-b`;
    const outside = mkdtempSync(path.join(tmpdir(), 'pg-out-'));
    try {
      const f = path.join(outside, 's'); writeFileSync(f, 'x');
      try {
        await assertSafeUploadPath(f);
        throw new Error('expected throw');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toMatch(/Unreachable.*typo-a/);
        expect(msg).toMatch(/Unreachable.*typo-b/);
      }
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('TANDOOR_MCP_UPLOAD_ROOT="" denies every upload (explicit deny-all)', async () => {
    process.env.TANDOOR_MCP_UPLOAD_ROOT = '';
    const target = path.join(allowed, 'r.png');
    writeFileSync(target, 'x');
    await expect(assertSafeUploadPath(target))
      .rejects.toThrow(/outside the allowed upload roots/);
  });
});

describe('openSafeUpload — TOCTOU defense', () => {
  let allowed: string;
  let prevRoot: string | undefined;
  beforeEach(() => {
    allowed = mkdtempSync(path.join(tmpdir(), 'pg-toctou-'));
    prevRoot = process.env.TANDOOR_MCP_UPLOAD_ROOT;
    process.env.TANDOOR_MCP_UPLOAD_ROOT = allowed;
    _resetPathGuardCache();
  });
  afterEach(() => {
    rmSync(allowed, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.TANDOOR_MCP_UPLOAD_ROOT;
    else process.env.TANDOOR_MCP_UPLOAD_ROOT = prevRoot;
    _resetPathGuardCache();
  });

  it('readSafeUpload returns the file bytes for a happy-path file', async () => {
    const target = path.join(allowed, 'recipe.png');
    writeFileSync(target, 'hello');
    const { data, safePath } = await readSafeUpload(target);
    expect(data.toString('utf8')).toBe('hello');
    expect(safePath).toBe(await realpath(target));
  });

  it('fakes a TOCTOU swap: a file replaced between validation and open fails the ino check', async () => {
    const target = path.join(allowed, 'recipe.png');
    writeFileSync(target, 'original');
    const v = await assertSafeUploadPath(target);
    // Replace the file with a new one (same path, different inode).
    rmSync(target);
    writeFileSync(target, 'replaced');
    await expect(openSafeUpload(v))
      .rejects.toThrow(/identity changed between validation and open/);
  });
});

