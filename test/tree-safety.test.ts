import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { TreeSafetyClient } from '../src/clients/tree-safety.js';
import { RESOURCES, registerTreeSafetyTools } from '../src/tools/tree-safety.js';
import { makeTreeSafetyHandler } from '../src/handlers/tree-safety.js';
import { invokeTool, registeredToolNames } from './helpers/mcp.js';
import { _resetRegisteredNames } from '../src/lib/register.js';

beforeEach(() => {
  _resetRegisteredNames();
});

class SpyClient extends TreeSafetyClient {
  public calls: string[] = [];
  protected async request<T>(endpoint: string): Promise<T> {
    this.calls.push(endpoint);
    return { tree: 'stub', endpoint } as unknown as T;
  }
}

const cfg = { url: 'https://x.test', token: 't' };

describe('TreeSafetyClient.preview URL construction', () => {
  it('builds /api/{resource}/{id}/{action}/ for every combo', async () => {
    const c = new SpyClient(cfg);
    for (const { slug } of RESOURCES) {
      for (const action of ['cascading', 'nulling', 'protecting'] as const) {
        await c.preview(slug, 7, action);
      }
    }
    const expected = RESOURCES.flatMap(({ slug }) =>
      ['cascading', 'nulling', 'protecting'].map((a) => `/api/${slug}/7/${a}/`),
    );
    expect(c.calls).toEqual(expected);
  });
});

describe('tree-safety handler', () => {
  it('emits raw response as JSON', async () => {
    const fakeClient: any = {
      treeSafety: {
        preview: async (resource: string, id: number, action: string) => ({
          resource, id, action, related: [{ id: 1 }],
        }),
      },
    };
    const handler = makeTreeSafetyHandler('food', 'cascading');
    const out = await handler(fakeClient, { id: 42 });
    expect(JSON.parse(out)).toEqual({
      resource: 'food', id: 42, action: 'cascading', related: [{ id: 1 }],
    });
  });

  it('wraps a 404 error with resource + id', async () => {
    const fakeClient: any = {
      treeSafety: {
        preview: async () => {
          throw new Error('Tandoor API error: 404 Not Found\nDetail: gone');
        },
      },
    };
    const handler = makeTreeSafetyHandler('food', 'cascading');
    await expect(handler(fakeClient, { id: 99 })).rejects.toThrow(/food with id 99 not found/);
  });

  it('propagates non-404 errors unchanged', async () => {
    const fakeClient: any = {
      treeSafety: {
        preview: async () => {
          throw new Error('Tandoor API error: 500 Server Error');
        },
      },
    };
    const handler = makeTreeSafetyHandler('recipe', 'nulling');
    await expect(handler(fakeClient, { id: 7 })).rejects.toThrow(/500 Server Error/);
  });

  it('wraps a 404 raised as err.status=404 without "404" in the message', async () => {
    const fakeClient: any = {
      treeSafety: {
        preview: vi.fn(async () => {
          throw Object.assign(new Error('gone'), { status: 404 });
        }),
      },
    };
    const handler = makeTreeSafetyHandler('food', 'cascading');
    await expect(handler(fakeClient, { id: 99 })).rejects.toThrow(/food with id 99 not found/);
  });

  it('logs the underlying error to stderr before throwing the friendly wrap', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakeClient: any = {
      treeSafety: {
        preview: async () => {
          throw new Error('Tandoor API error: 404 Not Found\nDetail: recipe gone');
        },
      },
    };
    const handler = makeTreeSafetyHandler('recipe', 'nulling');
    try {
      await expect(handler(fakeClient, { id: 7 })).rejects.toThrow(/recipe with id 7 not found/);
      const joined = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(joined).toMatch(/tree-safety 404 wrap resource=recipe id=7 action=nulling/);
      expect(joined).toMatch(/underlying=.*404 Not Found/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('TreeSafetyClient resource allow-list', () => {
  it('rejects a slug not in the allow-list to prevent path traversal', async () => {
    const c = new SpyClient(cfg);
    await expect(c.preview('../users' as any, 1, 'cascading')).rejects.toThrow(/unknown resource/);
    expect(c.calls).toEqual([]);
  });

  it('accepts every RESOURCES slug', async () => {
    const c = new SpyClient(cfg);
    for (const { slug } of RESOURCES) {
      await c.preview(slug, 1, 'cascading');
    }
    expect(c.calls.length).toBe(RESOURCES.length);
  });
});

describe('registerTreeSafetyTools', () => {
  function freshServer(): McpServer {
    return new McpServer({ name: 'test', version: 'test' });
  }

  it('registers RESOURCES.length * 3 tools', () => {
    const server = freshServer();
    const client = new TandoorClient(cfg);
    registerTreeSafetyTools(server, client);
    const names = registeredToolNames(server).filter((n) => n.startsWith('preview_'));
    expect(names.length).toBe(RESOURCES.length * 3);
    expect(names.length).toBe(33);
  });

  it('names follow preview_{resource_snake}_delete_{action} pattern', () => {
    const server = freshServer();
    const client = new TandoorClient(cfg);
    registerTreeSafetyTools(server, client);
    const names = new Set(registeredToolNames(server));
    for (const { resource } of RESOURCES) {
      for (const action of ['cascading', 'nulling', 'protecting']) {
        expect(names.has(`preview_${resource}_delete_${action}`)).toBe(true);
      }
    }
  });

  it('end-to-end: preview_food_delete_cascading returns raw client response', async () => {
    const server = freshServer();
    const client = new TandoorClient(cfg);
    (client as any).treeSafety = {
      preview: async (r: string, id: number, a: string) => ({ r, id, a, cascaded: ['x'] }),
    };
    registerTreeSafetyTools(server, client);
    const res = await invokeTool(server, 'preview_food_delete_cascading', { id: 3 });
    expect(JSON.parse(res.content[0].text)).toEqual({ r: 'food', id: 3, a: 'cascading', cascaded: ['x'] });
  });

  it('end-to-end: preview_recipe_delete_nulling routes to nulling action', async () => {
    const server = freshServer();
    const client = new TandoorClient(cfg);
    (client as any).treeSafety = {
      preview: async (r: string, id: number, a: string) => ({ r, id, a }),
    };
    registerTreeSafetyTools(server, client);
    const res = await invokeTool(server, 'preview_recipe_delete_nulling', { id: 9 });
    expect(JSON.parse(res.content[0].text)).toEqual({ r: 'recipe', id: 9, a: 'nulling' });
  });

  it('end-to-end: preview_keyword_delete_protecting routes to protecting action', async () => {
    const server = freshServer();
    const client = new TandoorClient(cfg);
    (client as any).treeSafety = {
      preview: async (r: string, id: number, a: string) => ({ r, id, a }),
    };
    registerTreeSafetyTools(server, client);
    const res = await invokeTool(server, 'preview_keyword_delete_protecting', { id: 11 });
    expect(JSON.parse(res.content[0].text)).toEqual({ r: 'keyword', id: 11, a: 'protecting' });
  });
});
