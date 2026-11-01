// MCP resources — read-only context the model can subscribe to. Unlike
// tools, resources don't require a function call to inspect; the client
// pre-fetches them so the model always has current state.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { TandoorClient } from '../clients/index.js';

function jsonResource(uri: string, data: unknown): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data),
      },
    ],
  };
}

/** Week boundary helpers in the user's local timezone (Monday-anchored). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekRange(anchor: Date = new Date()): { from: string; to: string } {
  const from = new Date(anchor);
  // Anchor to start of day local.
  from.setHours(0, 0, 0, 0);
  // Move to Monday of this week.
  const day = from.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  from.setDate(from.getDate() + diffToMonday);
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from: isoDate(from), to: isoDate(to) };
}

const PANTRY_CAP = 500;

async function collectUpTo(
  fetchPage: (page: number) => Promise<{ results: any[]; next: string | null }>,
  keep: (item: any) => boolean,
): Promise<{ items: any[]; truncated: boolean }> {
  const items: any[] = [];
  for (let page = 1; ; page++) {
    const r = await fetchPage(page);
    for (const item of r.results) {
      if (!keep(item)) continue;
      if (items.length === PANTRY_CAP) return { items, truncated: true };
      items.push(item);
    }
    if (!r.next) return { items, truncated: false };
  }
}

export function registerResources(server: McpServer, client: TandoorClient): void {
  server.registerResource(
    'meal-plan-this-week',
    'tandoor://meal-plan/this-week',
    {
      title: 'Meal Plan — This Week',
      description:
        'Your meal plan entries for Monday-Sunday of the current week, trimmed to {id, date, meal_type, recipe_name, servings, note}. Auto-refreshes every read.',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const { from, to } = weekRange();
      const page = await client.mealPlans.listMealPlans({
        from_date: from,
        to_date: to,
        page_size: 50,
      });
      const slim = (page.results || []).map((m: any) => ({
        id: m.id,
        date: m.from_date,
        to_date: m.to_date,
        meal_type: m.meal_type_name || m.meal_type?.name,
        meal_type_id: m.meal_type?.id,
        recipe: m.recipe_name || m.recipe?.name,
        recipe_id: m.recipe?.id,
        title: m.title,
        servings: m.servings,
        note: m.note,
      }));
      return jsonResource(uri.href, { week: { from, to }, count: slim.length, results: slim });
    }
  );

  server.registerResource(
    'pantry-on-hand',
    'tandoor://pantry/on-hand',
    {
      title: 'Pantry — On Hand',
      description:
        `What is available. locations holds inventory entries with amount > 0, grouped by location. is_freezer marks freezers. Each entry has amount, unit, expires, sub_location, and note. on_hand_no_quantity holds foods flagged on hand that have no inventory entry. Shows at most ${PANTRY_CAP} entries and ${PANTRY_CAP} foods. When truncated.entries is true, use list_inventory_entries for the full list.`,
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const entries = await collectUpTo(
        (page) => client.inventory.listEntries({ page, page_size: 100 }),
        () => true,
      );
      const stockedFoodIds = new Set(entries.items.map((e) => e.food.id));
      const foods = await collectUpTo(
        (page) => client.foodUnits.listFoods({ page, page_size: 100 }),
        (f) => f.food_onhand && !stockedFoodIds.has(f.id),
      );
      const locations = new Map<number, { id: number; name: string; is_freezer: boolean; entries: unknown[] }>();
      for (const e of entries.items) {
        const loc = e.inventory_location;
        let group = locations.get(loc.id);
        if (!group) {
          group = { id: loc.id, name: loc.name, is_freezer: loc.is_freezer, entries: [] };
          locations.set(loc.id, group);
        }
        group.entries.push({
          id: e.id,
          food: e.food.name,
          food_id: e.food.id,
          amount: e.amount,
          unit: e.unit?.name ?? null,
          expires: e.expires,
          sub_location: e.sub_location,
          note: e.note,
        });
      }
      return jsonResource(uri.href, {
        locations: [...locations.values()],
        on_hand_no_quantity: foods.items.map((f) => ({ id: f.id, name: f.name, supermarket_category: f.supermarket_category?.name ?? null })),
        counts: { entries: entries.items.length, foods_on_hand_only: foods.items.length },
        truncated: { entries: entries.truncated, foods: foods.truncated },
      });
    }
  );

  server.registerResource(
    'shopping-list-active',
    'tandoor://shopping-list/active',
    {
      title: 'Shopping List — Active',
      description:
        'Unchecked shopping list entries (Tandoor filters to recent + unchecked by default). Slim fields: food, unit, amount, list_recipe.',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const page = await client.shopping.listEntries({ page_size: 200 });
      const slim = (page.results || []).map((e: any) => ({
        id: e.id,
        food: e.food?.name,
        unit: e.unit?.name,
        amount: e.amount,
        checked: e.checked,
        from_recipe: e.list_recipe_data?.recipe_data?.name,
        list_recipe: e.list_recipe,
      }));
      return jsonResource(uri.href, { count: slim.length, results: slim });
    }
  );

  server.registerResource(
    'meal-types',
    'tandoor://meal-types',
    {
      title: 'Meal Types',
      description:
        'Available meal types (Breakfast, Lunch, Dinner, etc.) with their IDs for use in create_meal_plan.',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const types = await client.mealPlans.listMealTypes();
      return jsonResource(
        uri.href,
        (types || []).map((t: any) => ({ id: t.id, name: t.name, time: t.time, color: t.color }))
      );
    }
  );
}
