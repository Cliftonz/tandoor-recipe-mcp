// MCP prompts — user-invokable templates. These are the "/ commands" a user
// runs from an MCP client UI. Each prompt returns a set of messages the model
// should use as its starting context.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TandoorClient } from '../clients/index.js';

function textMessage(role: 'user' | 'assistant', text: string): GetPromptResult['messages'][number] {
  return { role, content: { type: 'text', text } };
}

export function registerPrompts(server: McpServer, _client: TandoorClient): void {
  server.registerPrompt(
    'plan_week',
    {
      title: 'Plan the week',
      description:
        'Plan dinners for the next 7 days, optionally biased toward on-hand pantry foods, a set of keyword tags, or a saved custom filter.',
      argsSchema: {
        start_date: z
          .string()
          .optional()
          .describe('YYYY-MM-DD. Default today.'),
        days: z
          .string()
          .optional()
          .describe('Number of days to plan. Default 7.'),
        keywords: z
          .string()
          .optional()
          .describe('Comma-separated keyword names to bias toward (e.g. "vegetarian,quick").'),
        use_pantry: z
          .string()
          .optional()
          .describe('"true" to prefer recipes using foods currently on-hand.'),
      },
    },
    ({ start_date, days, keywords, use_pantry }): GetPromptResult => {
      const startLine = start_date ? `Start date: ${start_date}` : 'Start today.';
      const dayCount = days || '7';
      const kwLine = keywords ? `Favor these keywords: ${keywords}` : 'No keyword preference — mix it up.';
      const pantryLine = use_pantry === 'true'
        ? 'First, read the `tandoor://pantry/on-hand` resource and bias recipe choices toward what\'s already in the pantry.'
        : 'Ignore pantry on-hand state unless the user asks.';

      return {
        description: 'Generate a week-long meal plan in Tandoor.',
        messages: [
          textMessage(
            'user',
            [
              `Plan dinner for ${dayCount} days.`,
              startLine,
              kwLine,
              pantryLine,
              '',
              'Workflow:',
              '1. Read `tandoor://meal-types` to find the dinner meal_type_id.',
              '2. Use `list_recipes` with the keyword filter (if any) and sort_order=-rating to pick candidates.',
              '3. Avoid repeating recipes within the window; prefer variety across protein/cuisine.',
              '4. For each day, call `create_meal_plan` with {recipe_id, meal_type_id, servings: 2, from_date: YYYY-MM-DD}.',
              '5. After all plans are created, summarize the plan back to the user with recipe names + dates.',
              '6. Offer to generate a shopping list (see the `grocery_list_for_plan` prompt) once the user approves.',
            ].join('\n')
          ),
        ],
      };
    }
  );

  server.registerPrompt(
    'grocery_list_for_plan',
    {
      title: 'Grocery list for the plan',
      description:
        'Convert this week\'s meal plan into a shopping list, grouped by supermarket category, at the specified servings.',
      argsSchema: {
        servings_override: z
          .string()
          .optional()
          .describe('Optional: scale every recipe to N servings instead of using the plan\'s servings.'),
      },
    },
    ({ servings_override }): GetPromptResult => {
      const servingsNote = servings_override
        ? `Scale every recipe to ${servings_override} servings when adding to the list (override the plan's own servings).`
        : 'Use each meal plan\'s servings value as-is.';

      return {
        description: 'Generate a grocery list from this week\'s meal plan.',
        messages: [
          textMessage(
            'user',
            [
              'Generate a shopping list for this week\'s meal plan.',
              servingsNote,
              '',
              'Workflow:',
              '1. Read `tandoor://meal-plan/this-week` to get all planned meals for Mon-Sun.',
              '2. For each plan with a recipe_id, call `add_recipe_to_shopping_list` with {id: recipe_id, servings: <plan servings>} so Tandoor merges ingredients.',
              '3. Read `tandoor://shopping-list/active` to show the current pending entries.',
              '4. Group the entries by food.supermarket_category (call `get_food` if the category is missing) and present as a checklist grouped by aisle.',
              '5. Flag any ingredient where the food is already in `tandoor://pantry/on-hand` — user may want to skip.',
            ].join('\n')
          ),
        ],
      };
    }
  );

  server.registerPrompt(
    'what_can_i_make_tonight',
    {
      title: 'What can I make tonight?',
      description:
        'Find recipes that can be made with on-hand pantry foods right now, sorted by rating.',
      argsSchema: {
        max_time_minutes: z
          .string()
          .optional()
          .describe('Upper bound on working_time + waiting_time. Default 60.'),
      },
    },
    ({ max_time_minutes }): GetPromptResult => {
      const timeBound = max_time_minutes || '60';
      return {
        description: 'Find makeable recipes.',
        messages: [
          textMessage(
            'user',
            [
              `What can I make tonight? Give me up to 5 options, each under ${timeBound} minutes total time.`,
              '',
              'Workflow:',
              '1. Read `tandoor://pantry/on-hand` so you know what\'s available.',
              '2. Call `list_recipes` with makenow=true, sort_order=-rating, page_size=10 to get candidates Tandoor thinks are makeable.',
              `3. Filter candidates where working_time + waiting_time <= ${timeBound}.`,
              '4. For the top 5, call `get_recipe` (format=slim) to show ingredient names and step count.',
              '5. Present as a numbered list with name, total time, and 1-line description. Do not start cooking anything — wait for user to pick.',
            ].join('\n')
          ),
        ],
      };
    }
  );

  server.registerPrompt(
    'import_and_plan',
    {
      title: 'Import a recipe URL and plan it',
      description:
        'Import a recipe from a URL and immediately schedule it on a meal plan.',
      argsSchema: {
        url: z.string().describe('Recipe URL to import.'),
        when: z
          .string()
          .optional()
          .describe('When to schedule it (YYYY-MM-DD). Default today.'),
        meal_type: z
          .string()
          .optional()
          .describe('Meal type name (Breakfast/Lunch/Dinner). Default Dinner.'),
        servings: z
          .string()
          .optional()
          .describe('Servings. Default 2.'),
      },
    },
    ({ url, when, meal_type, servings }): GetPromptResult => {
      return {
        description: 'Import a recipe and plan it.',
        messages: [
          textMessage(
            'user',
            [
              `Import the recipe at ${url} and schedule it.`,
              `When: ${when || 'today'}. Meal type: ${meal_type || 'Dinner'}. Servings: ${servings || '2'}.`,
              '',
              'Workflow:',
              '1. Call `import_recipe_from_url` with {url, format: "slim"}. If it throws, retry with create_stub_on_failure=true only after checking the error reason.',
              `2. Read \`tandoor://meal-types\` and find the id matching "${meal_type || 'Dinner'}".`,
              `3. Call \`create_meal_plan\` with {recipe_id: <id from step 1>, meal_type_id, servings: ${servings || 2}, from_date: "${when || 'YYYY-MM-DD of today'}"}.`,
              '4. Confirm back to the user with recipe name + scheduled date.',
            ].join('\n')
          ),
        ],
      };
    }
  );
}
