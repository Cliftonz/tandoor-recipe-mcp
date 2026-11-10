import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openSurface, textOf, type Surface } from './helpers/surface.js';
import { COVERS } from './helpers/coverage.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

(url && token ? describe : describe.skip)('ai_step_sort against live Tandoor', () => {
  const prefix = `e2e-ass-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const undo: (() => Promise<unknown>)[] = [];
  let s: Surface;
  let recipeId: number;
  let providerId: number;

  async function post(path: string, body: unknown): Promise<{ status: number; text: string }> {
    const res = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  }

  beforeAll(async () => {
    s = await openSurface(url!, token!);
    const recipe = await s.call('create_recipe', {
      name: `${prefix}-recipe`,
      steps: [{ instruction: 'Boil water. Add pasta. Drain and serve.', ingredients: [] }],
      format: 'full',
    });
    recipeId = recipe.id;
    undo.push(() => s.call('delete_recipe', { id: recipeId }));
    const provider = await s.call('create_ai_provider', {
      name: `${prefix}-ai`, model_name: 'e2e-unrouted-model', api_key: prefix, format: 'full',
    });
    providerId = provider.id;
    undo.push(() => s.call('delete_ai_provider', { id: providerId }));
  });

  afterAll(async () => {
    for (const step of undo.reverse()) await step();
    await s.close();
    expect(COVERS['ai-step-sort.e2e.test.ts'].filter((t) => !s.called.has(t))).toEqual([]);
  });

  it('Tandoor rejects the body we send for lacking a provider, before any AI call', async () => {
    const res = await post('/api/ai-step-sort/', { recipe: recipeId });
    expect(res).toMatchObject({ status: 400, text: expect.stringMatching(/You must select an AI provider/) });
  });

  it('Tandoor takes a full recipe body with ?provider= past validation to the AI call', async () => {
    const recipe = await s.call('get_recipe', { id: recipeId, format: 'full' });
    const res = await post(`/api/ai-step-sort/?provider=${providerId}`, recipe);
    expect(res).toMatchObject({ status: 400, text: expect.stringMatching(/The AI could not process your request/) });
  });

  it('ai_step_sort with a provider reaches the AI call', async () => {
    const res = await s.raw('ai_step_sort', { recipe_id: recipeId, provider_id: providerId });
    expect(textOf(res)).toMatch(/The AI could not process your request/);
  });
});
