import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleAutoMealPlan } from '../src/handlers/mealplan.js';
import { TandoorClient } from '../src/clients/index.js';
import { startStub, Stub } from './helpers/stub-http.js';

let stub: Stub;
let body: Record<string, unknown>;

beforeEach(async () => {
  stub = await startStub((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      body = JSON.parse(raw);
      res.setHeader('content-type', 'application/json');
      res.end('[]');
    });
  });
});
afterEach(() => stub.close());

const base = {
  start_date: '2026-04-18', end_date: '2026-04-20',
  meal_type_id: 2, servings: 3, addshopping: true,
};

describe('auto_meal_plan request body', () => {
  it('sends keyword_ids as bare integer keywords and omits keyword_mode when unset', async () => {
    const client = new TandoorClient({ url: stub.url, token: 't' });
    await handleAutoMealPlan(client, { ...base, keyword_ids: [1, 2] });
    expect(body).toEqual({ ...base, keywords: [1, 2] });
  });

  it('forwards keyword_mode when set', async () => {
    const client = new TandoorClient({ url: stub.url, token: 't' });
    await handleAutoMealPlan(client, { ...base, keyword_ids: [5], keyword_mode: 'or' });
    expect(body).toEqual({ ...base, keywords: [5], keyword_mode: 'or' });
  });

  it('sends an empty keywords list through to Tandoor', async () => {
    const client = new TandoorClient({ url: stub.url, token: 't' });
    await handleAutoMealPlan(client, { ...base, keyword_ids: [] });
    expect(body).toEqual({ ...base, keywords: [] });
  });
});
