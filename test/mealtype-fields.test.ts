import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerMealTypeTools } from '../src/tools/mealtype.js';
import { startStub, Stub } from './helpers/stub-http.js';

interface Captured { method: string; body: any }

describe('meal type tool fields against Tandoor 2.6', () => {
  let stub: Stub;
  let mcp: Client;
  let server: McpServer;
  let requests: Captured[];

  beforeAll(async () => {
    stub = await startStub((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const body = raw ? JSON.parse(raw) : undefined;
        requests.push({ method: req.method!, body });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ id: 5, name: 'Brunch', ...body }));
      });
    });
    server = new McpServer({ name: 'test', version: 'test' });
    registerMealTypeTools(server, new TandoorClient({ url: stub.url, token: 'x' }));
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    mcp = new Client({ name: 'test-client', version: 'test' });
    await mcp.connect(clientT);
  });

  afterAll(async () => {
    await mcp.close();
    await server.close();
    await stub.close();
  });

  beforeEach(() => { requests = []; });

  const call = async (name: string, args: Record<string, unknown>) => {
    const r: any = await mcp.callTool({ name, arguments: args });
    expect(r.isError).toBeFalsy();
    const text: string = r.content[0].text;
    return JSON.parse(text.slice(text.indexOf('{')));
  };

  it('create and update schemas and descriptions no longer advertise `default`', async () => {
    const { tools } = await mcp.listTools();
    for (const name of ['create_meal_type', 'update_meal_type']) {
      const tool = tools.find((t) => t.name === name)!;
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain('default');
      expect(tool.description).not.toMatch(/\bdefault\b/);
    }
  });

  it('create_meal_type drops a caller-supplied `default` from the POST body', async () => {
    await call('create_meal_type', { name: 'Brunch', default: true });
    expect(requests[0].method).toBe('POST');
    expect(requests[0].body).toEqual({ name: 'Brunch' });
  });

  it('update_meal_type drops a caller-supplied `default` from the PATCH body', async () => {
    await call('update_meal_type', { id: 5, name: 'Late', default: true });
    expect(requests[0].method).toBe('PATCH');
    expect(requests[0].body).toEqual({ name: 'Late' });
  });

  it('create_meal_type sends `time` and returns it in the slim output', async () => {
    const out = await call('create_meal_type', { name: 'Brunch', time: '10:30' });
    expect(requests[0].body).toEqual({ name: 'Brunch', time: '10:30' });
    expect(out).toEqual({ id: 5, name: 'Brunch', time: '10:30' });
  });

  it('update_meal_type sends `time` and returns it in the slim output', async () => {
    const out = await call('update_meal_type', { id: 5, time: '07:15' });
    expect(requests[0].body).toEqual({ time: '07:15' });
    expect(out).toEqual({ id: 5, name: 'Brunch', time: '07:15' });
  });

  it('create_meal_type description says an existing name returns the existing row', async () => {
    const { tools } = await mcp.listTools();
    const tool = tools.find((t) => t.name === 'create_meal_type')!;
    expect(tool.description).toMatch(/existing name returns the existing meal type/i);
  });

  it('create_meal_type description says time is returned as HH:MM:SS', async () => {
    const { tools } = await mcp.listTools();
    const tool = tools.find((t) => t.name === 'create_meal_type')!;
    expect(tool.description).toContain('time (HH:MM; returned as HH:MM:SS)');
  });
});
