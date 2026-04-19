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
        'Foods flagged as currently on-hand (food_onhand=true). Useful for "what can I make tonight?" style queries.',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      // Tandoor lacks an `on_hand=true` filter; walk the paginated list and
      // filter client-side. Cap at 200 to keep the resource cheap.
      const results: any[] = [];
      let page = 1;
      while (results.length < 500) {
        const r = await client.foodUnits.listFoods({ page, page_size: 100 });
        const items = r.results || [];
        for (const f of items) {
          if (f.food_onhand) {
            results.push({
              id: f.id,
              name: f.name,
              plural_name: f.plural_name,
              supermarket_category: f.supermarket_category?.name,
            });
          }
        }
        if (!r.next || items.length === 0) break;
        page++;
      }
      return jsonResource(uri.href, { count: results.length, results });
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
