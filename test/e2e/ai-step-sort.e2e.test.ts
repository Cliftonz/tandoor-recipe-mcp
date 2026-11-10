import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openSurface, textOf, type Surface } from './helpers/surface.js';
import { COVERS } from './helpers/coverage.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

(url && token ? describe : describe.skip)('ai_step_sort against live Tandoor', () => {
  const prefix = `e2e-ass-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let s: Surface;
  let recipeId: number;
  let providerId: number;

  beforeAll(async () => {
    s = await openSurface(url!, token!);
    recipeId = (await s.call('create_recipe', {
      name: `${prefix}-recipe`,
      steps: [{ instruction: 'Boil water. Add pasta. Drain and serve.', ingredients: [] }],
      format: 'full',
    })).id;
    providerId = (await s.call('create_ai_provider', {
      name: `${prefix}-ai`, model_name: 'e2e-unrouted-model', api_key: prefix, format: 'full',
    })).id;
  });

  afterAll(async () => {
    await s.call('delete_ai_provider', { id: providerId });
    await s.call('delete_recipe', { id: recipeId });
    await s.close();
    expect(COVERS['ai-step-sort.e2e.test.ts'].filter((t) => !s.called.has(t))).toEqual([]);
  });

  it('ai_step_sort with a provider reaches the AI call', async () => {
    const res = await s.raw('ai_step_sort', { recipe_id: recipeId, provider_id: providerId });
    expect(textOf(res)).toMatch(/The AI could not process your request/);
  });
});
