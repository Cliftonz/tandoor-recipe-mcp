import type { StashConfig } from './stash.js';
import type { VersionCheckResult } from './version-check.js';

export interface TransportInfo {
  mode: 'stdio' | 'http';
  bind?: string;
  requireAuth: boolean;
}

/**
 * Builds the instructions string sent to the MCP client on initialize; seen
 * by the model before tool schemas. Steers toward the right entry points so
 * complex queries don't start with a 100-tool scan. Extracted from index.ts
 * so the version-warning branches are unit-testable.
 */
export function buildInstructions(
  versionCheck: VersionCheckResult,
  stashCfg: StashConfig,
  transport?: TransportInfo,
): string {
  const lines: string[] = [];
  if (versionCheck.status === 'unsupported') {
    lines.push(`WARNING: ${versionCheck.detail}`, '');
  } else if (versionCheck.status === 'unknown') {
    lines.push(
      'NOTE: the Tandoor version could not be verified at startup. If write tools fail',
      'with serializer errors, the instance may be pre-2.x (unsupported).',
      '',
    );
  }
  lines.push(
    'Tandoor Recipes MCP server, full access to recipes, meal plans, shopping lists,',
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
    `Large results: tool responses bigger than ~${stashCfg.thresholdBytes} bytes come back as`,
    '`{stashed:true, handle, shape, sample_filters}` instead of the full payload. Call',
    '`jq_query` with that `handle` and a jq filter to extract the parts you need, do',
    'NOT re-run the original tool. Example: `jq_query({handle, filter: ".results | map({id, name})"})`.',
    'Operators can set TANDOOR_MCP_STASH_ENABLED=0 to disable this behavior.',
    '',
    'Require Tandoor serializer etiquette: foreign-key writes use `{id: n}` envelopes,',
    'not bare integers. All tools here already handle that, just pass `food_id`, etc.',
  );
  if (transport) {
    const bind = transport.bind ? ` bind=${transport.bind}` : '';
    const authRequired = transport.requireAuth ? 'yes' : 'no';
    lines.push('', `Transport: ${transport.mode}.${bind} auth-required: ${authRequired}`);
    if (transport.mode === 'http') {
      lines.push('Dynamic tool gating (enable_tool_group / disable_tool_group) is disabled in HTTP mode; set TANDOOR_MCP_PROFILE to lock the surface at boot.');
    }
  }
  return lines.join('\n');
}
