// A registered tool with no section can never be enabled, and a mapped name
// with no registered tool is a typo that breaks enablement on rename.

import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { _resetRegisteredNames, _resetArraySkipLog } from '../src/lib/register.js';
import { registeredToolNames } from './helpers/mcp.js';
import { ALWAYS_ON_GROUP, ALWAYS_ON_TOOLS, SECTIONS } from '../src/lib/sections.js';

function mappedPlacements(): Array<{ tool: string; placement: string }> {
  const out = ALWAYS_ON_TOOLS.map((tool) => ({ tool, placement: ALWAYS_ON_GROUP }));
  for (const s of SECTIONS) {
    if (s.kind === 'tiered') {
      for (const tool of s.simple) out.push({ tool, placement: `${s.name}:simple` });
      for (const tool of s.full) out.push({ tool, placement: `${s.name}:full` });
    } else {
      for (const tool of s.tools) out.push({ tool, placement: s.name });
    }
  }
  return out;
}

let registered: string[];

beforeAll(() => {
  _resetRegisteredNames();
  _resetArraySkipLog();
  const server = new McpServer({ name: 'completeness', version: 'completeness' });
  const client = new TandoorClient({ url: 'https://x.test', token: 't' });
  registerAllTools(server, client, {
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck: { status: 'ok', level: 'note', detail: 'completeness stub' },
  });
  registered = registeredToolNames(server);
});

describe('section completeness', () => {
  it('every registered tool maps to exactly one (section, tier) or to always-on', () => {
    const placements = mappedPlacements();
    const wrong = registered
      .map((tool) => ({ tool, at: placements.filter((p) => p.tool === tool).map((p) => p.placement) }))
      .filter((r) => r.at.length !== 1);
    expect(wrong).toEqual([]);
  });

  it('every mapped name is registered', () => {
    const registeredSet = new Set(registered);
    const missing = mappedPlacements().filter((p) => !registeredSet.has(p.tool));
    expect(missing).toEqual([]);
  });
});
