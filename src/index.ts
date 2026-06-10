#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TandoorClient } from './clients/index.js';

// Read the runtime version from package.json so the MCP server advertises the
// same version users installed. Works both in source (src/ → ../package.json
// walk) and in the published tarball (build/ → ../package.json).
const thisDir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(thisDir, '..', 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};
import { getStashConfig } from './lib/stash.js';
import { registerRecipeTools } from './tools/recipe.js';
import { registerMealPlanTools } from './tools/mealplan.js';
import { registerIngredientTools } from './tools/ingredient.js';
import { registerShoppingTools } from './tools/shopping.js';
import { registerAiTools } from './tools/ai.js';
import { registerFoodUnitTools } from './tools/foodunit.js';
import { registerCookLogTools } from './tools/cooklog.js';
import { registerRecipeBookTools } from './tools/recipebook.js';
import { registerMiscTools } from './tools/misc.js';
import { registerStepTools } from './tools/step.js';
import { registerAdminTools } from './tools/admin.js';
import { registerJqTools } from './tools/jq.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';

// dotenv is a dev convenience — only load it if it's available (it's a
// devDependency, not a production dep). Real deployments inject env via the
// MCP client config.
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // dotenv not installed — fine in production installs.
}

const TANDOOR_URL = process.env.TANDOOR_URL;
const TANDOOR_TOKEN = process.env.TANDOOR_TOKEN;

if (!TANDOOR_URL || !TANDOOR_TOKEN) {
  console.error('Error: TANDOOR_URL and TANDOOR_TOKEN must be set in .env file');
  process.exit(1);
}

const tandoorClient = new TandoorClient({
  url: TANDOOR_URL,
  token: TANDOOR_TOKEN,
});

// Resolve once at startup so the instructions string (sent to the client on
// initialize) and the operator-facing startup log show the same effective
// numbers — including any overrides from TANDOOR_MCP_STASH_*.
const stashCfgAtBoot = getStashConfig();

const server = new McpServer(
  {
    name: pkg.name,
    version: pkg.version,
  },
  {
    // Sent to the client on initialize — seen by the model before tool schemas.
    // Steers toward the right entry points so complex queries don't start with
    // a 100-tool scan.
    instructions: [
      'Tandoor Recipes MCP server — full access to recipes, meal plans, shopping lists,',
      'ingredients, cook logs, nutrition, and AI-assisted imports.',
      '',
      'Where to start:',
      '- Current state (read-only): `tandoor://meal-plan/this-week`, `tandoor://pantry/on-hand`,',
      '  `tandoor://shopping-list/active`, `tandoor://meal-types`.',
      '- Common workflows: use the `plan_week`, `grocery_list_for_plan`,',
      '  `what_can_i_make_tonight`, or `import_and_plan` prompts.',
      '- Recipe search: use `search_recipes` with food/keyword *names* (it resolves IDs',
      '  for you). Fall back to `list_recipes` for the full filter surface.',
      '- Write tools return a slim JSON shape by default. Pass `format: "full"` for the raw',
      '  Tandoor API response when you need substitutes, image URLs, nutrition objects, etc.',
      '',
      `Large results: tool responses bigger than ~${stashCfgAtBoot.thresholdBytes} bytes come back as`,
      '`{stashed:true, handle, shape, sample_filters}` instead of the full payload. Call',
      '`jq_query` with that `handle` and a jq filter to extract the parts you need — do',
      'NOT re-run the original tool. Example: `jq_query({handle, filter: ".results | map({id, name})"})`.',
      'Operators can set TANDOOR_MCP_STASH_ENABLED=0 to disable this behavior.',
      '',
      'Require Tandoor serializer etiquette: foreign-key writes use `{id: n}` envelopes,',
      'not bare integers. All tools here already handle that — just pass `food_id`, etc.',
    ].join('\n'),
  }
);

// Tool-group profile. Every MCP client loads every tool schema into context
// on `list_tools`, so ~100 tools × ~400 tokens each is a real cost for small
// workflows. TANDOOR_MCP_PROFILE controls which groups are registered.
//   - "basic": recipe/meal-plan/shopping/ingredient/food+unit read + resources + prompts (~40 tools)
//   - "full"  (default): everything, including CRUD for admin resources, steps, books, etc.
const profile = (process.env.TANDOOR_MCP_PROFILE || 'full').toLowerCase();
const isBasic = profile === 'basic';

// Always-on groups — the core "use the app" surface.
registerRecipeTools(server, tandoorClient);
registerMealPlanTools(server, tandoorClient);
registerIngredientTools(server, tandoorClient);
registerShoppingTools(server, tandoorClient);
registerFoodUnitTools(server, tandoorClient);
registerJqTools(server, tandoorClient);
registerResources(server, tandoorClient);
registerPrompts(server, tandoorClient);

if (!isBasic) {
  // Full surface: advanced CRUD and admin.
  registerAiTools(server, tandoorClient);
  registerCookLogTools(server, tandoorClient);
  registerRecipeBookTools(server, tandoorClient);
  registerMiscTools(server, tandoorClient);
  registerStepTools(server, tandoorClient);
  registerAdminTools(server, tandoorClient);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // One-line startup banner on stderr (stdout belongs to the MCP transport).
  // Includes the resolved Tandoor origin (so operators can confirm the URL
  // normalization in base.ts produced what they expected — pasting a full
  // page URL into TANDOOR_URL is the common misconfiguration) and the
  // effective stash config (so "why isn't this being stashed" is debuggable
  // without source-diving).
  const stashLine = stashCfgAtBoot.enabled
    ? `stash=on(>${stashCfgAtBoot.thresholdBytes}B, ttl=${stashCfgAtBoot.ttlMs}ms, max=${stashCfgAtBoot.maxEntries}, maxBytes=${stashCfgAtBoot.maxBytes})`
    : 'stash=off';
  console.error(
    `[tandoor-mcp] ${pkg.name}@${pkg.version} on stdio | api=${tandoorClient.getBaseUrl()} | profile=${profile} | ${stashLine}`,
  );
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
