import { describe, it, expect } from 'vitest';
import { buildInstructions } from '../src/lib/instructions.js';
import { getStashConfig } from '../src/lib/stash.js';
import type { VersionCheckResult } from '../src/lib/version-check.js';

const stashCfg = { ...getStashConfig(), thresholdBytes: 12345 };

function result(status: VersionCheckResult['status']): VersionCheckResult {
  return { status, level: status === 'unsupported' ? 'warning' : 'note', detail: 'detail text here' };
}

describe('buildInstructions', () => {
  it('prepends a WARNING block when status is unsupported', () => {
    const out = buildInstructions(result('unsupported'), stashCfg);
    expect(out.startsWith('WARNING: detail text here')).toBe(true);
    expect(out).toContain('Tandoor Recipes MCP server');
  });

  it('prepends a softer NOTE when status is unknown', () => {
    const out = buildInstructions(result('unknown'), stashCfg);
    expect(out.startsWith('NOTE: the Tandoor version could not be verified')).toBe(true);
    expect(out).not.toMatch(/^WARNING:/);
  });

  it('omits both blocks when status is ok', () => {
    const out = buildInstructions(result('ok'), stashCfg);
    expect(out.startsWith('Tandoor Recipes MCP server')).toBe(true);
    expect(out).not.toContain('WARNING:');
    expect(out).not.toContain('NOTE:');
  });

  it('interpolates the effective stash threshold', () => {
    expect(buildInstructions(result('ok'), stashCfg)).toContain('~12345 bytes');
  });
});
