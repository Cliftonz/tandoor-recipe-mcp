import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openSurface, textOf, type Surface } from './helpers/surface.js';
import { updateSearchPreferenceShape } from '../../src/tools/housekeeping.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const modes = updateSearchPreferenceShape.search.unwrap().options;

(url && token ? describe : describe.skip)('update_search_preference search mode', () => {
  let s: Surface;
  let userId: number;
  let originalSearch: string;

  beforeAll(async () => {
    s = await openSurface(url!, token!);
    const [pref] = await s.call('list_search_preferences', {});
    userId = pref.user_id;
    originalSearch = pref.search;
  });

  afterAll(async () => {
    await s.call('update_search_preference', { user: userId, search: originalSearch });
    await s.close();
  });

  it('accepts every advertised search mode and persists it', async () => {
    const outcomes: Record<string, string> = {};
    for (const mode of modes) {
      const r = await s.raw('update_search_preference', { user: userId, search: mode });
      if (r.isError) { outcomes[mode] = `error: ${textOf(r)}`; continue; }
      const [pref] = await s.call('list_search_preferences', {});
      outcomes[mode] = `stored: ${pref.search}`;
    }
    expect(outcomes).toEqual(Object.fromEntries(modes.map((m) => [m, `stored: ${m}`])));
  });
});
