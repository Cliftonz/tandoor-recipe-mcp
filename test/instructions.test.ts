import { describe, it, expect } from 'vitest';
import { buildInstructions } from '../src/lib/instructions.js';
import { getStashConfig } from '../src/lib/stash.js';
import { parseSectionModes } from '../src/lib/sections.js';
import type { VersionCheckResult } from '../src/lib/version-check.js';

const stashCfg = { ...getStashConfig(), thresholdBytes: 12345 };
const defaults = parseSectionModes({});

function result(status: VersionCheckResult['status']): VersionCheckResult {
  return { status, level: status === 'unsupported' ? 'warning' : 'note', detail: 'detail text here' };
}

describe('buildInstructions', () => {
  it('prepends a WARNING block when status is unsupported', () => {
    const out = buildInstructions(result('unsupported'), stashCfg, defaults);
    expect(out.startsWith('WARNING: detail text here')).toBe(true);
    expect(out).toContain('Tandoor Recipes MCP server');
  });

  it('prepends a softer NOTE when status is unknown', () => {
    const out = buildInstructions(result('unknown'), stashCfg, defaults);
    expect(out.startsWith('NOTE: the Tandoor version could not be verified')).toBe(true);
    expect(out).not.toMatch(/^WARNING:/);
  });

  it('omits both blocks when status is ok', () => {
    const out = buildInstructions(result('ok'), stashCfg, defaults);
    expect(out.startsWith('Tandoor Recipes MCP server')).toBe(true);
    expect(out).not.toContain('WARNING:');
    expect(out).not.toContain('NOTE:');
  });

  it('interpolates the effective stash threshold', () => {
    expect(buildInstructions(result('ok'), stashCfg, defaults)).toContain('~12345 bytes');
  });

  it('lists each section with its current mode on one line', () => {
    const modes = parseSectionModes({ TANDOOR_MCP_RECIPES: 'full', TANDOOR_MCP_AI: 'on' });
    const lines = buildInstructions(result('ok'), stashCfg, modes).split('\n');
    expect(lines).toContain(
      'Tool sections: recipes=full, meal-plan=simple, shopping=simple, foods=simple, ' +
        'cooklog=off, recipe-books=off, ai=on, import-export=off, household-space=off, admin=off. ' +
        'Call list_tool_groups to see them.',
    );
  });

  it('names the section settings, not the removed profile, in HTTP mode', () => {
    const out = buildInstructions(result('ok'), stashCfg, defaults, { mode: 'http', requireAuth: true });
    expect(out).toContain('TANDOOR_MCP_RECIPES, TANDOOR_MCP_MEAL_PLAN');
    expect(out).not.toContain('TANDOOR_MCP_PROFILE');
  });
});
