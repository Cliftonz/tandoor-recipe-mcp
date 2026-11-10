import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openSurface, textOf, type Surface } from './helpers/surface.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

describe.skipIf(!(url && token))('import_recipe_from_image text-only against live Tandoor', () => {
  const prefix = `e2e-ait-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let s: Surface;
  let providerId: number;

  beforeAll(async () => {
    s = await openSurface(url!, token!);
    providerId = (await s.call('create_ai_provider', { name: `${prefix}-ai`, model_name: 'e2e-unrouted-model', api_key: prefix, format: 'full' })).id;
  });

  afterAll(async () => {
    await s.call('delete_ai_provider', { id: providerId });
    await s.close();
  });

  it('hands text-only input to Tandoor\'s AI step', async () => {
    const res = await s.raw('import_recipe_from_image', {
      ai_provider_id: providerId,
      text: 'Pancakes. 1 cup flour, 1 egg, 1 cup milk. Whisk and fry.',
    });
    expect(textOf(res)).toMatch(/The AI could not process your request/);
  });
});
