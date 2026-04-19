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
  console.error('Tandoor MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
