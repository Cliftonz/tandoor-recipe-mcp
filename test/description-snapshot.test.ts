// Snapshot of every tool's name + description.
//
// Tool descriptions are the LLM's primary signal for choosing tools and
// recovering from failures (e.g. "if no AI provider, suggest X"). A refactor
// that accidentally rewords or truncates them silently degrades agent
// behavior. This test snapshots the full list so any change shows up as a
// reviewable diff; `npx vitest -u` regenerates after intentional edits.
//
// Implementation note: this MUST drive `registerAllTools` (the same fn the
// production server uses) so a newly-added tool family can't be silently
// missing from the regression guard.

import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { _resetRegisteredNames, _resetArraySkipLog } from '../src/lib/register.js';
import { listRegisteredTools, RegisteredToolInfo } from './helpers/mcp.js';

let tools: RegisteredToolInfo[];

beforeAll(() => {
  // Reset both registration set AND array-skip dedup set so the same vitest
  // worker can run multiple registration-touching tests without state leak.
  _resetRegisteredNames();
  _resetArraySkipLog();
  const server = new McpServer({ name: 'snapshot', version: 'snapshot' });
  const client = new TandoorClient({ url: 'https://x.test', token: 't' });
  registerAllTools(server, client, {
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck: { status: 'ok', level: 'note', detail: 'snapshot test stub' },
  });
  tools = listRegisteredTools(server);
});

describe('tool description snapshot (full profile)', () => {
  it('tool count is stable', () => {
    // Update deliberately on tool additions or removals. Range guards mask silent tool loss.
    expect(tools.length).toBe(271);
  });

  it('every tool has at least one character of description', () => {
    // CRUD reads (`get_food`, `get_keyword`, etc.) are legitimately terse —
    // the schema and the name carry the meaning. This guard catches the
    // truly-empty cases that slip through during a refactor.
    const empty = tools.filter((t) => !t.description || t.description.trim() === '');
    expect(empty, `Tools with empty descriptions: ${empty.map((t) => t.name).join(', ')}`).toEqual([]);
  });

  it('descriptions match the recorded snapshot', () => {
    // High-signal: names + descriptions only. PRs that touch this part of
    // the file are description rewords (rare; hand-review every line).
    // Regenerate with `npx vitest -u` after an intentional reword.
    const descriptions = tools.map((t) => ({ name: t.name, description: t.description }));
    expect(descriptions).toMatchSnapshot();
  });

  it('input schemas match the recorded snapshot', () => {
    // Tripwire: full Zod-derived JSON schema for every tool. PRs that touch
    // this part are schema renames / additions; diff is large by design and
    // should be reviewed at the structural level, not line-by-line.
    const schemas = tools.map((t) => ({ name: t.name, inputSchema: t.inputSchema }));
    expect(schemas).toMatchSnapshot();
  });
});
