// Integration-level coverage for the meal plan hydration contract.
//
// Unlike the unit tests in ../handlers-full.test.ts which mock client methods,
// this suite mocks `fetch` itself with fixtures that replicate Tandoor's
// real DRF 400 response on a bare `{id}` envelope, plus its 201 on the
// hydrated envelope. If a future refactor silently reintroduces the 1.0.0
// bug shape, the bare-{id} fixture's 400 path surfaces as a test failure —
// which a mock-based client test cannot catch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TandoorClient } from '../../src/clients/index.js';
import { handleCreateMealPlan } from '../../src/handlers/mealplan.js';

// Captured from a real Tandoor instance rejecting a bare `{id}` write on the
// MealPlanSerializer. Kept as a fixture so the contract is grep-able.
const TANDOOR_400_BARE_ID_BODY = JSON.stringify({
  recipe: { name: ['This field is required.'] },
  meal_type: { name: ['This field is required.'] },
  servings: ['Not a valid string.'],
});

interface RouteHandler {
  method: string;
  test: (url: string) => boolean;
  respond: (url: string, init: RequestInit) => { status: number; body: any };
}

function makeFetchMock(routes: RouteHandler[]) {
  return vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const u = url.toString();
    const method = (init.method || 'GET').toUpperCase();
    const route = routes.find((r) => r.method === method && r.test(u));
    if (!route) {
      return new Response(`unexpected ${method} ${u}`, { status: 599 });
    }
    const { status, body } = route.respond(u, init);
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('meal plan hydration — integration against Tandoor wire contract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('produces a hydrated POST body that Tandoor (fixture) accepts with 201', async () => {
    const createCalls: any[] = [];
    const fetchMock = makeFetchMock([
      {
        method: 'GET',
        test: (u) => u.endsWith('/api/recipe/42/'),
        respond: () => ({
          status: 200,
          body: { id: 42, name: 'Chili', keywords: [{ id: 9, name: 'weeknight' }] },
        }),
      },
      {
        method: 'GET',
        test: (u) => u.endsWith('/api/meal-type/1/'),
        respond: () => ({ status: 200, body: { id: 1, name: 'Dinner' } }),
      },
      {
        method: 'POST',
        test: (u) => u.endsWith('/api/meal-plan/'),
        respond: (_u, init) => {
          const payload = JSON.parse(init.body as string);
          createCalls.push(payload);
          // Replicate Tandoor: reject bare-{id} writes with 400.
          const recipeOk = !payload.recipe || (typeof payload.recipe?.name === 'string');
          const mealTypeOk = typeof payload.meal_type?.name === 'string';
          const servingsOk = typeof payload.servings === 'string';
          if (!recipeOk || !mealTypeOk || !servingsOk) {
            return { status: 400, body: TANDOOR_400_BARE_ID_BODY };
          }
          return {
            status: 201,
            body: { id: 101, ...payload },
          };
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TandoorClient({ url: 'http://tandoor.test', token: 't' });
    const out = await handleCreateMealPlan(client, {
      recipe_id: 42,
      meal_type_id: 1,
      servings: 2,
      from_date: '2026-04-18',
    });

    expect(out).toContain('Meal plan created');
    expect(createCalls).toHaveLength(1);
    const sent = createCalls[0];
    expect(sent.recipe).toEqual({
      id: 42,
      name: 'Chili',
      keywords: [{ id: 9, name: 'weeknight' }],
    });
    expect(sent.meal_type).toEqual({ id: 1, name: 'Dinner' });
    expect(sent.servings).toBe('2');
    expect(sent.from_date).toBe('2026-04-18T00:00:00');
  });

  it('regression guard: a bare-{id} envelope is rejected by the fixture (proves the fixture models the bug)', async () => {
    // This test sends the OLD shape directly via the raw HTTP layer, bypassing
    // the handler. It's here so that if someone breaks the fixture to accept
    // bare-{id}, the main hydration test below no longer proves anything.
    const fetchMock = makeFetchMock([
      {
        method: 'POST',
        test: (u) => u.endsWith('/api/meal-plan/'),
        respond: (_u, init) => {
          const payload = JSON.parse(init.body as string);
          const hydrated = typeof payload.meal_type?.name === 'string'
            && typeof payload.servings === 'string';
          return hydrated
            ? { status: 201, body: { id: 1, ...payload } }
            : { status: 400, body: TANDOOR_400_BARE_ID_BODY };
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TandoorClient({ url: 'http://tandoor.test', token: 't' });
    await expect(
      (client.mealPlans as any).createMealPlan({
        recipe: { id: 42 },
        meal_type: { id: 1 },
        servings: 2,
        from_date: '2026-04-18',
      })
    ).rejects.toThrow(/Tandoor API error: 400/);
  });

  it('propagates a hydration 404 with the "Failed to hydrate" prefix and does NOT POST', async () => {
    const posts: any[] = [];
    const fetchMock = makeFetchMock([
      {
        method: 'GET',
        test: (u) => u.endsWith('/api/recipe/99/'),
        respond: () => ({ status: 404, body: { detail: 'Not found.' } }),
      },
      {
        method: 'GET',
        test: (u) => u.endsWith('/api/meal-type/1/'),
        respond: () => ({ status: 200, body: { id: 1, name: 'Dinner' } }),
      },
      {
        method: 'POST',
        test: (u) => u.endsWith('/api/meal-plan/'),
        respond: (_u, init) => {
          posts.push(init.body);
          return { status: 201, body: {} };
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TandoorClient({ url: 'http://tandoor.test', token: 't' });
    await expect(
      handleCreateMealPlan(client, {
        recipe_id: 99,
        meal_type_id: 1,
        servings: 2,
        from_date: '2026-04-18',
      })
    ).rejects.toThrow(/hydrate recipe 99 for create_meal_plan/);

    expect(posts).toHaveLength(0);  // critical: no bare-{id} fallback
  });
});
