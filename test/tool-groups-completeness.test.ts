// Completeness guard for the tool-gating contract.
//
// The dynamic tool-gating model (see src/lib/tool-groups.ts) is only safe
// when CORE_TOOLS ∪ TOOL_GROUPS covers every registered tool exactly once.
// A tool that's registered but missing from both sets is disabled at boot
// with no group name the LLM can call to re-enable it — silent capability
// loss. A stale name in CORE_TOOLS / TOOL_GROUPS that no longer maps to a
// registered tool is a typo waiting to break enablement on rename.
//
// This file is the regression guard for both directions.

import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { _resetRegisteredNames, _resetArraySkipLog } from '../src/lib/register.js';
import { registeredToolNames } from './helpers/mcp.js';
import { CORE_TOOLS, TOOL_GROUPS, findToolGroup } from '../src/lib/tool-groups.js';

// Allowlist for names listed in CORE_TOOLS / TOOL_GROUPS that intentionally
// aren't registered yet (forward declarations). Empty in steady state — any
// non-empty allowlist must be paired with a TODO that has an owner.
const PENDING_REGISTRATION: ReadonlySet<string> = new Set([]);

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

describe('tool-groups completeness', () => {
  it('every registered tool is in CORE_TOOLS or exactly one TOOL_GROUPS entry', () => {
    // Forward direction: catches "added a new tool, forgot to group it".
    // Disabled-by-default + no group means the LLM has no way to enable it.
    const ungrouped = registered.filter((n) => findToolGroup(n) === 'ungrouped');
    expect(
      ungrouped,
      `Registered tools not reachable via core or any group: ${ungrouped.join(', ')}. ` +
        'Either add them to CORE_TOOLS (always-on) or to a TOOL_GROUPS entry.',
    ).toEqual([]);
  });

  it('no tool name appears in two different TOOL_GROUPS entries', () => {
    // Duplicate group membership means disable_tool_group on one group
    // leaves the tool enabled via the other — the operator's mental model
    // of "this group is off" silently lies.
    const seen = new Map<string, string>();
    const dupes: Array<{ tool: string; groups: [string, string] }> = [];
    for (const g of TOOL_GROUPS) {
      for (const t of g.tools) {
        const prior = seen.get(t);
        if (prior !== undefined) dupes.push({ tool: t, groups: [prior, g.name] });
        else seen.set(t, g.name);
      }
    }
    expect(dupes, `Tools listed in multiple groups: ${JSON.stringify(dupes)}`).toEqual([]);
  });

  it('CORE_TOOLS and TOOL_GROUPS entries are disjoint', () => {
    // A name in both is redundant at best and self-contradicting at worst
    // (disabling the group should not affect a core tool).
    const overlap: Array<{ tool: string; group: string }> = [];
    for (const g of TOOL_GROUPS) {
      for (const t of g.tools) {
        if (CORE_TOOLS.has(t)) overlap.push({ tool: t, group: g.name });
      }
    }
    expect(overlap, `Tools listed in both CORE_TOOLS and a group: ${JSON.stringify(overlap)}`).toEqual([]);
  });

  it('every name in CORE_TOOLS is actually registered (no stale entries)', () => {
    // Reverse direction: catches typos and renames. PENDING_REGISTRATION
    // is the narrow allowlist for tools that exist as forward declarations
    // before their registration code lands.
    const registeredSet = new Set(registered);
    const missing = [...CORE_TOOLS].filter((n) => !registeredSet.has(n) && !PENDING_REGISTRATION.has(n));
    expect(
      missing,
      `Names in CORE_TOOLS not actually registered: ${missing.join(', ')}. ` +
        'Either fix the typo, remove the stale entry, or — if intentional — add to PENDING_REGISTRATION with a TODO.',
    ).toEqual([]);
  });

  it('every name in TOOL_GROUPS is actually registered (no stale entries)', () => {
    const registeredSet = new Set(registered);
    const missing: Array<{ tool: string; group: string }> = [];
    for (const g of TOOL_GROUPS) {
      for (const t of g.tools) {
        if (!registeredSet.has(t) && !PENDING_REGISTRATION.has(t)) {
          missing.push({ tool: t, group: g.name });
        }
      }
    }
    expect(
      missing,
      `Names in TOOL_GROUPS not actually registered: ${JSON.stringify(missing)}. ` +
        'Either fix the typo, remove the stale entry, or — if intentional — add to PENDING_REGISTRATION with a TODO.',
    ).toEqual([]);
  });

  it('PENDING_REGISTRATION names are all referenced somewhere in CORE_TOOLS or TOOL_GROUPS', () => {
    // The allowlist itself must not rot. If a pending name graduates to
    // "registered" (or gets dropped from the design), it should leave this
    // set the same day. Otherwise the allowlist masks future bugs.
    const all = new Set<string>(CORE_TOOLS);
    for (const g of TOOL_GROUPS) for (const t of g.tools) all.add(t);
    const orphans = [...PENDING_REGISTRATION].filter((n) => !all.has(n));
    expect(
      orphans,
      `Names in PENDING_REGISTRATION but not referenced by CORE_TOOLS or TOOL_GROUPS: ${orphans.join(', ')}. ` +
        'Remove them from PENDING_REGISTRATION.',
    ).toEqual([]);
  });
});
