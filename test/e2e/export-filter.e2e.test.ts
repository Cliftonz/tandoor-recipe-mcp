import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerExportTools } from '../../src/tools/export.js';
import { invokeTool } from '../helpers/mcp.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const d = url && token ? describe : describe.skip;

d('export_recipes with custom_filter', () => {
  let client: TandoorClient;
  let mcp: McpServer;
  const marker = `zqexport${Date.now()}`;
  const recipeIds: number[] = [];
  let filterId: number;

  beforeAll(async () => {
    process.env.TANDOOR_MCP_PROFILE = 'full';
    client = new TandoorClient({ url: url!, token: token! });
    mcp = new McpServer({ name: 'e2e', version: 'e2e' });
    registerExportTools(mcp, client);
    for (const name of [`${marker} soup`, 'unrelated stew']) {
      const r = await client.recipes.createRecipe({ name, internal: true, steps: [] } as any);
      recipeIds.push(r.id!);
    }
    const cf = await client.customFilters.createFilter({
      name: `e2e-export-filter-${Date.now()}`,
      search: JSON.stringify({ query: marker }),
      shared: [],
    });
    filterId = cf.id;
  });

  afterAll(async () => {
    delete process.env.TANDOOR_MCP_PROFILE;
    if (filterId) await client.customFilters.deleteFilter(filterId);
    for (const id of recipeIds) await client.recipes.deleteRecipe(id);
  });

  it('starts an export scoped to the filter', async () => {
    const res = await invokeTool(mcp, 'export_recipes', { type: 'DEFAULT', custom_filter: filterId });
    const text: string = res.content[0].text;
    expect(res.isError, text).toBeFalsy();
    expect(text).toContain('Export started');
    const logId = JSON.parse(text.slice(text.indexOf('{'))).id;

    let log = await client.exports.getExportLog(logId);
    for (let i = 0; i < 60 && log.running; i++) {
      await new Promise((r) => setTimeout(r, 500));
      log = await client.exports.getExportLog(logId);
    }
    expect(log.running).toBe(false);
    expect(log.total_recipes).toBe(1);
  });
});
