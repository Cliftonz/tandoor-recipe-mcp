// Regression guard for Item 6 (P1 Perf): every new-in-1.5.0 handler family
// must forward ctx.signal into its client call so cancellation reaches fetch.

import { describe, it, expect, vi } from 'vitest';

import { handleListSyncs } from '../src/handlers/sync.js';
import { handleListStorages } from '../src/handlers/storage.js';
import { handleListSupermarkets } from '../src/handlers/supermarket.js';
import { handleListInviteLinks } from '../src/handlers/invite-link.js';
import { handleListSpaces } from '../src/handlers/space.js';
import { handleListConnectors } from '../src/handlers/housekeeping.js';
import { handleListRecipeImports } from '../src/handlers/import.js';
import { handleListExportLogs } from '../src/handlers/export.js';
import { handleGetMealType } from '../src/handlers/mealtype.js';
import { handleListAiProviders } from '../src/handlers/ai.js';
import { handleListAccessTokens } from '../src/handlers/access-token.js';
import { makeTreeSafetyHandler } from '../src/handlers/tree-safety.js';

function paginated() {
  return { count: 0, next: null, previous: null, results: [] };
}

function pageOrArray() {
  return paginated();
}

describe('handler signal forwarding', () => {
  const ac = new AbortController();
  const ctx = { signal: ac.signal };

  it.each([
    ['sync', (client: any) => handleListSyncs(client, {}, ctx), (client: any) => client.syncs.listSyncs],
    ['storage', (client: any) => handleListStorages(client, {}, ctx), (client: any) => client.storages.listStorages],
    ['supermarket', (client: any) => handleListSupermarkets(client, {}, ctx), (client: any) => client.supermarkets.listSupermarkets],
    ['invite-link', (client: any) => handleListInviteLinks(client, {}, ctx), (client: any) => client.inviteLinks.listInviteLinks],
    ['space', (client: any) => handleListSpaces(client, {}, ctx), (client: any) => client.spaces.listSpaces],
    ['housekeeping', (client: any) => handleListConnectors(client, {}, ctx), (client: any) => client.housekeeping.listConnectors],
    ['import', (client: any) => handleListRecipeImports(client, {}, ctx), (client: any) => client.imports.listRecipeImports],
    ['export', (client: any) => handleListExportLogs(client, {}, ctx), (client: any) => client.exports.listExportLogs],
    ['mealtype', (client: any) => handleGetMealType(client, { id: 1 }, ctx), (client: any) => client.mealTypes.getMealType],
    ['ai', (client: any) => handleListAiProviders(client, {}, ctx), (client: any) => client.ai.listAiProviders],
    ['access-token', (client: any) => handleListAccessTokens(client, {}, ctx), (client: any) => client.accessTokens.listTokens],
  ])('%s forwards ctx.signal into the sub-client call', async (_name, invoke, pick) => {
    const stub = vi.fn(async () => pageOrArray());
    const client: any = {
      syncs: { listSyncs: stub },
      storages: { listStorages: stub },
      supermarkets: { listSupermarkets: stub },
      inviteLinks: { listInviteLinks: stub },
      spaces: { listSpaces: stub },
      housekeeping: { listConnectors: stub },
      imports: { listRecipeImports: stub },
      exports: { listExportLogs: stub },
      mealTypes: { getMealType: stub },
      ai: { listAiProviders: stub },
      accessTokens: { listTokens: stub },
    };
    await invoke(client);
    const spy = pick(client) as ReturnType<typeof vi.fn>;
    const lastCall = spy.mock.calls.at(-1) as any[];
    const opts = lastCall.at(-1);
    expect(opts).toEqual({ signal: ac.signal });
  });

  it('tree-safety handler forwards ctx.signal', async () => {
    const preview = vi.fn(async () => ({}));
    const client: any = { treeSafety: { preview } };
    const handler = makeTreeSafetyHandler('food', 'cascading');
    await handler(client, { id: 1 }, ctx);
    expect(preview).toHaveBeenCalledWith('food', 1, 'cascading', { signal: ac.signal });
  });
});
