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
import { registerResources } from '../resources/index.js';
import { registerPrompts } from '../prompts/index.js';
import type { VersionCheckResult } from './version-check.js';

export interface RegisterAllToolsOptions {
  /** TANDOOR_MCP_PROFILE — "basic" trims admin/misc surface. Defaults "full". */
  profile?: 'basic' | 'full';
  /** Package metadata threaded into registerVersionTools. Required. */
  pkg: { name: string; version: string };
  /** Version probe result threaded into registerVersionTools. Required. */
  versionCheck: VersionCheckResult;
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
  const profile = opts.profile ?? 'full';
  const { pkg, versionCheck } = opts;

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

  if (profile !== 'basic') {
    registerAiTools(server, client);
    registerCookLogTools(server, client);
    registerRecipeBookTools(server, client);
    registerMiscTools(server, client);
    registerStepTools(server, client);
    registerAdminTools(server, client);
  }
}
