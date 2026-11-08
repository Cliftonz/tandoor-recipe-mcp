---
name: plan-week
description: Plan meals for the coming days in Tandoor Recipes. Use when the user asks to plan the week, plan dinners or other meals for a date range, fill a meal plan, or decide what to cook over the next few days.
---

# Plan the week

Plan meals for a date range with the Tandoor MCP tools. Read first, then create the plans and show what you created.

## Tools and sections

| Tool | Section | Tier |
| --- | --- | --- |
| `list_meal_types` | `meal-plan` | simple |
| `list_meal_plans` | `meal-plan` | simple |
| `create_meal_plan` | `meal-plan` | simple |
| `update_meal_plan` | `meal-plan` | simple |
| `delete_meal_plan` | `meal-plan` | simple |
| `bulk_create_meal_plans` | `meal-plan` | full |
| `search_recipes` | `recipes` | simple |
| `list_recipes` | `recipes` | simple |
| `list_keywords` | `recipes` | simple |
| `list_inventory_entries` | `inventory` | simple |
| `list_cook_logs` | `cooklog` | on |

If a tool is not available after searching for it, call `list_tool_groups` to see each section's mode, then:

- In local mode, call `enable_tool_group` with the section name. For a tiered section, ask for the tier from the table.
- In remote (HTTP) mode, `enable_tool_group` is not available. Tell the user which section the server operator must turn on, and at which tier. Continue with the tools you have.

The `cooklog` section is off by default. If it stays off, skip the cook log step and use the recipe sort order described below.

## 1. Clarify the goal

You need these facts before you plan:

- The date range: start date and end date.
- Which meals: breakfast, lunch, dinner, or others. Call `list_meal_types` to get the meal types and their ids.
- Servings per meal.
- Preferences and exclusions: diets, foods to avoid, cuisines, effort or time limits.

Ask only for what the user has not told you. Ask in one message.

## 2. Gather context

1. Call `list_meal_plans` with the start date and end date. Note every slot that already has a plan, so you do not book it twice.
2. If the `cooklog` section is on, call `list_cook_logs` and note recipes made recently. Avoid repeating them unless the user asks for them. If the section is off, call `search_recipes` with sort order "lastcooked" to put recipes that were not made recently first.
3. Call `list_inventory_entries` to see what is on hand. Favor recipes that use those foods, especially perishable ones. You can also pass makenow as true to `search_recipes` to get only recipes that can be made from on-hand foods.
4. Find candidate recipes with `search_recipes`. Pass food and keyword names; the tool resolves them to ids. Use exclude foods and exclude keywords for the user's exclusions. Check the unresolved names it reports and tell the user about any name it dropped. Call `list_keywords` if you need the exact keyword names.
5. Use `list_recipes` only for filters that `search_recipes` does not have, such as a saved custom filter id or date ranges for when recipes were cooked.

If a result comes back stashed, call `jq_query` on its handle. Do not run the original tool again.

## 3. Act or preview

An explicit request, such as "plan dinners for next week and create them", is approval. Create the plans, then summarize them.

Show a preview first and wait for a yes only when:

- the request is vague, such as "help me with meals";
- the plan would replace or delete an existing plan;
- you would create more than 7 meal plans.

A preview or a summary is a short table:

| Date | Meal type | Recipe | Servings |
| --- | --- | --- | --- |
| Mon 9 Nov | Dinner | Chicken curry | 4 |

- Show existing plans in the range too, marked as existing.
- Say why you picked a recipe when the reason is not obvious, for example "uses the spinach in the fridge".

## 4. Create the meal plans

- For each slot, pass the recipe id, the date, the meal type id, and the servings.
- For many slots, use `bulk_create_meal_plans` in one call. It needs the `meal-plan` section at full. Its result lists created and failed entries; one failure does not stop the others. Report any failures and retry only those.
- For a few slots, or if the full tier is not available, call `create_meal_plan` once per slot.
- Leave addshopping off unless the user asks. The shopping list step comes next.

## Safety

- Never delete or overwrite an existing plan without asking. Name the plan and the date, then wait for a yes before you call `update_meal_plan` or `delete_meal_plan`.

## 5. Offer the next step

After the plans exist, show the summary table and offer to build the shopping list for the range with the shopping-from-plan skill.
