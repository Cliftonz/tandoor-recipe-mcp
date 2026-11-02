import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { isHttpTransport, registerStringTool } from '../lib/register.js';
import { ALWAYS_ON_GROUP, ALWAYS_ON_TOOLS, SECTIONS, SECTIONS_WITH_TOOLS, SECTION_ENV_VARS, modesOf, sectionTools, visibleTools, type Section, type SectionMode, type SectionModes } from '../lib/sections.js';

interface RegisteredToolEntry {
  enabled: boolean;
  enable(): void;
  disable(): void;
}

function getRegistry(server: McpServer): Record<string, RegisteredToolEntry> {
  // The SDK exposes no public way to enumerate or toggle registered tools.
  return (server as unknown as { _registeredTools: Record<string, RegisteredToolEntry> })._registeredTools;
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
  const section = SECTIONS_WITH_TOOLS.find((s) => s.name === group);
  if (!section) {
    throw new Error(
      `unknown section '${group}'. Known sections: ${[ALWAYS_ON_GROUP, ...SECTIONS_WITH_TOOLS.map((s) => s.name)].join(', ')}. Call list_tool_groups for descriptions.`,
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

const HTTP_GATING_DISABLED_MSG =
  `Dynamic tool gating is disabled in HTTP transport mode. Set the section settings (${SECTION_ENV_VARS}) to lock the surface at boot.`;

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
    .describe('Name of the section to turn off. The "always" section cannot be disabled.'),
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
        'List every tool section with its current mode and the modes it accepts.',
        'Tiered sections (off / simple / full) and on/off sections can be widened with enable_tool_group and turned off with disable_tool_group.',
        'The "always" section is permanent.',
        'When a section changes, its tools appear in or leave tools/list and the SDK emits tools/list_changed so the client refreshes mid-conversation.',
        'Use this first to discover what is available before reaching for enable_tool_group.',
      ].join(' '),
      inputSchema: listToolGroupsShape,
    },
    async () => {
      const reg = getRegistry(server);
      const registered = (names: readonly string[]) => names.filter((n) => reg[n] !== undefined);
      const groups: object[] = [{
        name: ALWAYS_ON_GROUP,
        description: 'Always-on tools: diagnostics, jq, current space, and these gating tools.',
        mode: 'on',
        modes: ['on'],
        tools: registered(ALWAYS_ON_TOOLS),
      }];
      for (const section of SECTIONS_WITH_TOOLS) {
        groups.push({
          name: section.name,
          description: section.description,
          mode: modes.get(section.name),
          modes: modesOf(section),
          tools: section.kind === 'tiered'
            ? { simple: registered(section.simple), full: registered(section.full) }
            : registered(section.tools),
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
        'Widen a section so its tools become visible in tools/list.',
        'For a tiered section, tier "simple" or "full" (default full) picks how much to show; on/off sections take no tier.',
        'Enabling never narrows a section: asking for simple on a section already at full leaves it at full.',
        'The SDK emits tools/list_changed automatically; the client refreshes its tool list mid-conversation.',
        'Be sparing: every enabled tool adds its schema to your context budget. Run list_tool_groups first to see what is available.',
      ].join(' '),
      inputSchema: enableToolGroupShape,
    },
    async (_client, args) => {
      if (isHttpTransport()) throw new Error(HTTP_GATING_DISABLED_MSG);
      if (args.group === ALWAYS_ON_GROUP) return JSON.stringify({ ok: true, group: ALWAYS_ON_GROUP, mode: 'on', enabled: [] });
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
        'Turn a section off so all its tools disappear from tools/list.',
        'The SDK emits tools/list_changed automatically.',
        'The "always" section cannot be disabled.',
        'Use this to free context budget once a workflow no longer needs a section.',
      ].join(' '),
      inputSchema: disableToolGroupShape,
    },
    async (_client, args) => {
      if (isHttpTransport()) throw new Error(HTTP_GATING_DISABLED_MSG);
      if (args.group === ALWAYS_ON_GROUP) throw new Error(`cannot disable the '${ALWAYS_ON_GROUP}' section; its tools are always on.`);
      const section = findSection(args.group);
      modes.set(section.name, 'off');
      const { disabled } = applyMode(getRegistry(server), section, 'off');
      return JSON.stringify({ ok: true, group: section.name, mode: 'off', disabled });
    },
  );
}
