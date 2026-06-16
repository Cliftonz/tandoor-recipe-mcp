// Single source of truth for which tool groups get registered on the MCP
// server, and in which order. Both src/index.ts (production) and
// test/description-snapshot.test.ts (regression guard) use this — adding a
// new tool family means touching one place, not two.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerRecipeTools } from '../tools/recipe.js';
import { registerMealPlanTools } from '../tools/mealplan.js';
import { registerIngredientTools } from '../tools/ingredient.js';
import { registerShoppingTools } from '../tools/shopping.js';
import { registerFoodUnitTools } from '../tools/foodunit.js';
import { registerJqTools } from '../tools/jq.js';
import { registerVersionTools } from '../tools/version.js';
import { registerAiTools } from '../tools/ai.js';
import { registerCookLogTools } from '../tools/cooklog.js';
import { registerRecipeBookTools } from '../tools/recipebook.js';
import { registerMiscTools } from '../tools/misc.js';
import { registerStepTools } from '../tools/step.js';
import { registerAdminTools } from '../tools/admin.js';
import { registerToolGroupTools } from '../tools/tool-groups.js';
import { registerResources } from '../resources/index.js';
import { registerPrompts } from '../prompts/index.js';
import { CORE_TOOLS } from './tool-groups.js';
import type { VersionCheckResult } from './version-check.js';

export type RegisterProfile = 'core' | 'basic' | 'full';

export interface RegisterAllToolsOptions {
  /**
   * TANDOOR_MCP_PROFILE — controls how many tools are visible in tools/list.
   *   - "core"  (default): every tool is REGISTERED but only CORE_TOOLS stays
   *     enabled. Non-core tools are disabled at boot and revealed on demand
   *     via `enable_tool_group`. Keeps the LLM's tool-list context small.
   *   - "basic": skip admin/misc tool families entirely (legacy profile —
   *     retained so anyone pinned to it doesn't break, but `core` is the
   *     better lever now).
   *   - "full":  every tool registered AND enabled at boot. No gating.
   */
  profile?: RegisterProfile;
  /** Package metadata threaded into registerVersionTools. Required. */
  pkg: { name: string; version: string };
  /** Version probe result threaded into registerVersionTools. Required. */
  versionCheck: VersionCheckResult;
}

interface RegisteredToolEntry {
  enabled: boolean;
  enable(): void;
  disable(): void;
}

/**
 * Register every tool family the server exposes. Order is preserved so
 * downstream test snapshots stay stable across runs.
 *
 * `pkg` and `versionCheck` are required so a production miswire that drops
 * them silently registers `get_version` with fake data. Tests pass explicit
 * stubs (see test/description-snapshot.test.ts) so the "this is a stub" path
 * lives in test code, never inside this module.
 */
export function registerAllTools(
  server: McpServer,
  client: TandoorClient,
  opts: RegisterAllToolsOptions,
): void {
  const profile: RegisterProfile = opts.profile ?? 'core';
  const { pkg, versionCheck } = opts;

  // Meta gating tools — must register before the rest so they're in
  // CORE_TOOLS and visible at boot regardless of profile.
  registerToolGroupTools(server, client);

  // Always-on groups — the core "use the app" surface.
  registerRecipeTools(server, client);
  registerMealPlanTools(server, client);
  registerIngredientTools(server, client);
  registerShoppingTools(server, client);
  registerFoodUnitTools(server, client);
  registerJqTools(server, client);
  registerVersionTools(server, client, pkg, versionCheck);
  registerResources(server, client);
  registerPrompts(server, client);

  // Optional groups. The "basic" profile keeps the historical behavior of
  // not registering admin/misc at all; "core" and "full" register everything
  // and rely on enable/disable for visibility.
  if (profile !== 'basic') {
    registerAiTools(server, client);
    registerCookLogTools(server, client);
    registerRecipeBookTools(server, client);
    registerMiscTools(server, client);
    registerStepTools(server, client);
    registerAdminTools(server, client);
  }

  // Apply the core gate: disable every registered tool that isn't in
  // CORE_TOOLS. The SDK will emit tools/list_changed on the first connect;
  // tools/list responses then exclude disabled tools.
  if (profile === 'core') {
    const reg = (server as unknown as { _registeredTools?: Record<string, RegisteredToolEntry> })._registeredTools ?? {};
    for (const name of Object.keys(reg)) {
      if (!CORE_TOOLS.has(name)) reg[name]!.disable();
    }
  }
}
