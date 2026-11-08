import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openSurface, textOf, bodyOf, type Surface } from './helpers/surface.js';
import { seeder, type Seed, type Seeder } from './helpers/seed.js';
import { READ_ARGS, SHOWS_SEEDED } from './helpers/read-args.js';
import { COVERS, activeSkips, skipFor } from './helpers/coverage.js';
import { readToolNames } from './helpers/tools.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const readTools = await readToolNames();

(url && token ? describe : describe.skip)('every read-only tool against seeded live Tandoor', () => {
  let admin: Surface;
  let surface: Surface;
  let scopedTokenId: number;
  let seeding: Seeder;
  let seed: Seed;

  beforeAll(async () => {
    admin = await openSurface(url!, token!);
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    const scoped = await admin.call('create_access_token', { scope: 'read write bookmarklet mealplan', expires });
    scopedTokenId = scoped.id;
    surface = await openSurface(url!, scoped.token);
    seeding = seeder(surface, url!, scoped.token);
    seed = await seeding.run();
    process.stderr.write(`  read sweep on Tandoor ${surface.tandoorVersion}: ${activeSkips(surface.tandoorVersion).length} reviewed skip(s)\n`);
  });

  afterAll(async () => {
    await seeding.teardown();
    await surface.close();
    await admin.call('delete_access_token', { id: scopedTokenId });
    await admin.close();
    const called = new Set([...admin.called, ...surface.called]);
    expect(COVERS['read-sweep.e2e.test.ts'].filter((t) => !called.has(t))).toEqual([]);
  });

  it.for(readTools)('%s', async (tool, ctx) => {
    const skip = skipFor(tool, surface.tandoorVersion);
    if (skip) ctx.skip(skip.reason);
    const res = await surface.raw(tool, READ_ARGS[tool]?.(seed) ?? {});
    const text = textOf(res);
    expect(res.isError, text).toBeFalsy();
    if (tool.startsWith('list_')) expect(() => bodyOf(text), text).not.toThrow();
    if (SHOWS_SEEDED[tool]) expect(text).toContain(SHOWS_SEEDED[tool](seed));
  });
});
