// Meta tools: dynamic tool-group discovery and gating.
//
// At boot, `registerAllTools` registers every tool with the SDK then — when
// profile=core — calls `.disable()` on each tool not in CORE_TOOLS. Disabled
// tools are excluded from `tools/list` so the LLM sees only the small core
// surface (~25 tools) instead of the full ~135.
//
// These three tools are the LLM's escape hatch:
//   - `list_tool_groups` — what groups exist and which are enabled right now
//   - `enable_tool_group` — flip a group's tools to enabled (SDK auto-emits
//     `tools/list_changed`, so Claude refreshes its tool list mid-conversation)
//   - `disable_tool_group` — symmetric; the LLM can put unused groups back to
//     sleep to keep its tool-list context small
//
// All three are in CORE_TOOLS so they're always reachable. They access the
// SDK's private `_registeredTools` map — same pattern as test/helpers/mcp.ts.
// Confining the private access to a single file means the next SDK rename
// is a one-line fix here, not a four-file grep.
//
// CORE_TOOLS itself is exposed as the synthetic group "core" (permanent: true)
// so the LLM can introspect what it already has.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { CORE_TOOLS, TOOL_GROUPS } from '../lib/tool-groups.js';

interface RegisteredToolEntry {
  enabled: boolean;
  enable(): void;
  disable(): void;
}

function getRegistry(server: McpServer): Record<string, RegisteredToolEntry> {
  // The SDK keeps registered tools on a private field. We access it the same
  // way test/helpers/mcp.ts does, so any future SDK rename is a single
  // grep+fix across two files. Returning the live map (not a copy) is
  // intentional: the meta tools mutate it.
  return ((server as unknown as { _registeredTools?: Record<string, RegisteredToolEntry> })._registeredTools) ?? {};
}

const SYNTHETIC_CORE_GROUP = 'core';

export const listToolGroupsShape = {} as const;

export const enableToolGroupShape = {
  group: z
    .string()
    .min(1)
    .describe(
      'Name of the group to enable. Run list_tool_groups to see available group names. The synthetic "core" group is permanent — calling enable on it is a no-op.',
    ),
} as const;

export const disableToolGroupShape = {
  group: z
    .string()
    .min(1)
    .describe(
      'Name of the group to disable. The synthetic "core" group cannot be disabled.',
    ),
} as const;

export type EnableToolGroupArgs = z.infer<z.ZodObject<typeof enableToolGroupShape>>;
export type DisableToolGroupArgs = z.infer<z.ZodObject<typeof disableToolGroupShape>>;

export function registerToolGroupTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(
    server,
    client,
    'list_tool_groups',
    {
      description: [
        'List every tool group exposed by this MCP server and whether each is currently enabled.',
        'The "core" group is permanent and always enabled; non-core groups start disabled (with profile=core) and can be turned on by calling enable_tool_group with the group name.',
        'When a group is enabled, its tools become visible via tools/list and the SDK emits tools/list_changed so the client refreshes mid-conversation.',
        'Use this first to discover what is available before reaching for enable_tool_group.',
      ].join(' '),
      inputSchema: listToolGroupsShape,
    },
    async () => {
      const reg = getRegistry(server);
      const groups: Array<{
        name: string;
        description: string;
        permanent: boolean;
        enabled: boolean;
        tools: string[];
      }> = [];

      const coreTools = [...CORE_TOOLS];
      groups.push({
        name: SYNTHETIC_CORE_GROUP,
        description: 'Always-on tools — diagnostics, reads, and the meta-gating tools themselves.',
        permanent: true,
        enabled: true,
        tools: coreTools,
      });

      for (const g of TOOL_GROUPS) {
        // A group counts as "enabled" iff every registered tool it owns is
        // enabled. A tool that's missing from the registry (filtered out via
        // TANDOOR_MCP_EXCLUDE, or not yet wired up) is excluded from the
        // calculation rather than treated as disabled — otherwise an operator
        // who excludes one tool from a group can never see "enabled: true"
        // even after calling enable_tool_group.
        const present = g.tools.filter((t) => reg[t] !== undefined);
        const enabled = present.length > 0 && present.every((t) => reg[t]!.enabled);
        groups.push({
          name: g.name,
          description: g.description,
          permanent: false,
          enabled,
          tools: [...g.tools],
        });
      }

      return JSON.stringify({ groups });
    },
  );

  registerStringTool(
    server,
    client,
    'enable_tool_group',
    {
      description: [
        'Enable every tool in the named group so they become visible in tools/list.',
        'The SDK emits tools/list_changed automatically; the client refreshes its tool list mid-conversation.',
        'Idempotent: enabling an already-enabled group is a no-op.',
        'Passing "core" is also a no-op (core is always on).',
        'Be sparing — every enabled group adds tool schemas to your context budget. Run list_tool_groups first to see what is available.',
      ].join(' '),
      inputSchema: enableToolGroupShape,
    },
    async (_client, args) => {
      const group = args.group;
      if (group === SYNTHETIC_CORE_GROUP) {
        return JSON.stringify({
          ok: true,
          group,
          note: 'core is permanent and always enabled.',
          enabled: [],
          already_enabled: [...CORE_TOOLS],
          skipped: [],
        });
      }
      const g = TOOL_GROUPS.find((x) => x.name === group);
      if (!g) {
        const known = [SYNTHETIC_CORE_GROUP, ...TOOL_GROUPS.map((x) => x.name)];
        throw new Error(
          `unknown tool group '${group}'. Known groups: ${known.join(', ')}. Call list_tool_groups for descriptions.`,
        );
      }
      const reg = getRegistry(server);
      const enabled: string[] = [];
      const alreadyEnabled: string[] = [];
      const skipped: string[] = [];
      for (const t of g.tools) {
        const r = reg[t];
        if (!r) {
          // Tool wasn't registered (filtered out via TANDOOR_MCP_EXCLUDE, or
          // not yet wired in). Report so the operator can see *why* enabling
          // the group didn't expose what they expected.
          skipped.push(t);
          continue;
        }
        if (r.enabled) {
          alreadyEnabled.push(t);
        } else {
          r.enable();
          enabled.push(t);
        }
      }
      return JSON.stringify({
        ok: true,
        group,
        enabled,
        already_enabled: alreadyEnabled,
        skipped,
      });
    },
  );

  registerStringTool(
    server,
    client,
    'disable_tool_group',
    {
      description: [
        'Disable every tool in the named group so they disappear from tools/list.',
        'The SDK emits tools/list_changed automatically.',
        'Idempotent: disabling an already-disabled group is a no-op.',
        'The synthetic "core" group cannot be disabled.',
        'Use this to free context budget once a workflow no longer needs a group of tools.',
      ].join(' '),
      inputSchema: disableToolGroupShape,
    },
    async (_client, args) => {
      const group = args.group;
      if (group === SYNTHETIC_CORE_GROUP) {
        throw new Error("cannot disable 'core' — it is the permanent always-on group.");
      }
      const g = TOOL_GROUPS.find((x) => x.name === group);
      if (!g) {
        const known = [SYNTHETIC_CORE_GROUP, ...TOOL_GROUPS.map((x) => x.name)];
        throw new Error(
          `unknown tool group '${group}'. Known groups: ${known.join(', ')}. Call list_tool_groups for descriptions.`,
        );
      }
      const reg = getRegistry(server);
      const disabled: string[] = [];
      const alreadyDisabled: string[] = [];
      const skipped: string[] = [];
      for (const t of g.tools) {
        const r = reg[t];
        if (!r) {
          skipped.push(t);
          continue;
        }
        if (!r.enabled) {
          alreadyDisabled.push(t);
        } else {
          r.disable();
          disabled.push(t);
        }
      }
      return JSON.stringify({
        ok: true,
        group,
        disabled,
        already_disabled: alreadyDisabled,
        skipped,
      });
    },
  );
}
