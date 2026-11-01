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
import { ALWAYS_ON_GROUP, SECTIONS, modesOf, sectionTools, visibleTools, type Section, type SectionMode, type SectionModes } from '../lib/sections.js';

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

interface ModeChange {
  enabled: string[];
  disabled: string[];
}

function applyMode(reg: Record<string, RegisteredToolEntry>, section: Section, mode: SectionMode): ModeChange {
  const on = new Set(visibleTools(section, mode));
  const change: ModeChange = { enabled: [], disabled: [] };
  for (const name of sectionTools(section)) {
    const tool = reg[name];
    if (!tool || tool.enabled === on.has(name)) continue;
    if (on.has(name)) {
      tool.enable();
      change.enabled.push(name);
    } else {
      tool.disable();
      change.disabled.push(name);
    }
  }
  return change;
}

export function applySectionModes(server: McpServer, modes: SectionModes): void {
  const reg = getRegistry(server);
  for (const section of SECTIONS) applyMode(reg, section, modes.get(section.name)!);
}

function findSection(group: string): Section {
  const section = SECTIONS.find((s) => s.name === group);
  if (!section) {
    throw new Error(
      `unknown tool group '${group}'. Known groups: ${SECTIONS.map((s) => s.name).join(', ')}. Call list_tool_groups for descriptions.`,
    );
  }
  return section;
}

function widen(section: Section, current: SectionMode, tier: 'simple' | 'full' | undefined): SectionMode {
  if (section.kind === 'toggle' && tier) {
    throw new Error(`'${section.name}' is an on/off section and takes no tier.`);
  }
  const target: SectionMode = section.kind === 'tiered' ? (tier ?? 'full') : 'on';
  const order = modesOf(section);
  return order.indexOf(target) > order.indexOf(current) ? target : current;
}

const SYNTHETIC_CORE_GROUP = 'core';

const HTTP_GATING_DISABLED_MSG =
  'Dynamic tool gating is disabled in HTTP transport mode. Set TANDOOR_MCP_PROFILE=core|basic|full to lock the surface at boot.';

function isHttpMode(): boolean {
  return (process.env.TANDOOR_MCP_TRANSPORT || '').toLowerCase() === 'http';
}

const listToolGroupsShape = {} as const;

export const enableToolGroupShape = {
  group: z
    .string()
    .min(1)
    .describe('Name of the section to enable. Run list_tool_groups to see available sections.'),
  tier: z
    .enum(['simple', 'full'])
    .optional()
    .describe('Tier for a tiered section (default full). Not accepted for on/off sections.'),
} as const;

export const disableToolGroupShape = {
  group: z
    .string()
    .min(1)
    .describe('Name of the section to turn off. The "always" group cannot be disabled.'),
} as const;

export type EnableToolGroupArgs = z.infer<z.ZodObject<typeof enableToolGroupShape>>;
export type DisableToolGroupArgs = z.infer<z.ZodObject<typeof disableToolGroupShape>>;

export function registerToolGroupTools(server: McpServer, client: TandoorClient, modes: SectionModes): void {
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
      if (isHttpMode()) throw new Error(HTTP_GATING_DISABLED_MSG);
      const section = findSection(args.group);
      const mode = widen(section, modes.get(section.name)!, args.tier);
      modes.set(section.name, mode);
      const { enabled } = applyMode(getRegistry(server), section, mode);
      return JSON.stringify({ ok: true, group: section.name, mode, enabled });
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
      if (isHttpMode()) throw new Error(HTTP_GATING_DISABLED_MSG);
      if (args.group === ALWAYS_ON_GROUP) throw new Error(`cannot disable '${ALWAYS_ON_GROUP}'; its tools are always on.`);
      const section = findSection(args.group);
      modes.set(section.name, 'off');
      const { disabled } = applyMode(getRegistry(server), section, 'off');
      return JSON.stringify({ ok: true, group: section.name, mode: 'off', disabled });
    },
  );
}
