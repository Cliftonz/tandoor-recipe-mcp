import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { handleAutoMealPlan } from '../src/handlers/mealplan.js';
import { registerMealPlanTools } from '../src/tools/mealplan.js';
import { TandoorClient } from '../src/clients/index.js';
import { startStub, Stub } from './helpers/stub-http.js';

let stub: Stub;
let body: Record<string, unknown>;
let reply: { status: number; json: string };

beforeEach(async () => {
  reply = { status: 200, json: '[]' };
  stub = await startStub((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      body = JSON.parse(raw);
      res.statusCode = reply.status;
      res.setHeader('content-type', 'application/json');
      res.end(reply.json);
    });
  });
});
afterEach(() => stub.close());

const base = {
  start_date: '2026-04-18', end_date: '2026-04-20',
  meal_type_id: 2, servings: 3, addshopping: true,
};

async function callTool(args: Record<string, unknown>) {
  const server = new McpServer({ name: 'test', version: 'test' });
  registerMealPlanTools(server, new TandoorClient({ url: stub.url, token: 't' }));
  const [serverT, clientT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: 'test-client', version: 'test' });
  await client.connect(clientT);
  const result = (await client.callTool({ name: 'auto_meal_plan', arguments: args })) as {
    isError?: boolean;
    content: Array<{ text: string }>;
  };
  await client.close();
  await server.close();
  return result;
}

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

  it('accepts a call without keyword_ids and sends no keywords', async () => {
    const result = await callTool(base);
    expect(result.isError).toBeFalsy();
    expect(body).toEqual(base);
  });
});

describe('auto_meal_plan when Tandoor finds no recipes', () => {
  it("returns Tandoor's 400 message as the tool error", async () => {
    reply = { status: 400, json: '{"error":true,"msg":"No recipes found."}' };
    const result = await callTool({ ...base, keyword_ids: [9] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('400');
    expect(result.content[0].text).toContain('No recipes found.');
  });
});
