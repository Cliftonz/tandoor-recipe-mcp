---
name: shopping-from-plan
description: Build a shopping list from planned meals in Tandoor Recipes. Use when the user asks for a shopping list or grocery list for the week, for a date range, or for meals already in the meal plan.
---

# Shopping from the plan

Turn the meal plans in a date range into one shopping list with the Tandoor MCP tools. Read first, then add the ingredients and show what you added.

## Tools and sections

| Tool | Section | Tier |
| --- | --- | --- |
| `list_meal_plans` | `meal-plan` | simple |
| `get_recipe` | `recipes` | simple |
| `list_shopping_lists` | `shopping` | simple |
| `list_shopping_entries` | `shopping` | simple |
| `add_recipe_to_shopping_list` | `shopping` | simple |
| `bulk_check_shopping_entries` | `shopping` | simple |
| `bulk_update_shopping_entries` | `shopping` | simple |
| `list_shopping_list_recipes` | `shopping` | full |
| `list_supermarkets` | `shopping` | full |
| `list_supermarket_category_relations` | `shopping` | full |
| `list_inventory_entries` | `inventory` | simple |

If a tool is not available after searching for it, call `list_tool_groups` to see each section's mode, then:

- In local mode, call `enable_tool_group` with the section name. For a tiered section, ask for the tier from the table.
- In remote (HTTP) mode, `enable_tool_group` is not available. Tell the user which section the server operator must turn on, and at which tier. Continue with the tools you have.

## 1. Clarify the range

You need these facts before you add anything:

- The start date and end date, or the specific planned meals.
- Which named shopping list to use, if there are several. Call `list_shopping_lists` to see them. If there is one list or none, skip this question.
- Whether the user wants to keep food they already have on hand off the list.

Ask only for what the user has not told you. Ask in one message.

## 2. Read the meal plans

1. Call `list_meal_plans` with the start date and end date.
2. For each plan, note its id, recipe id, servings, and date.
3. Some plans have only a title and no recipe. They have no ingredients to add. List them in the summary so the user can add those items by hand.

If a result comes back stashed, call `jq_query` on its handle. Do not run the original tool again.

## 3. Check what is already on the list

Do this before you add anything, so you do not add a meal twice.

1. For each plan, call `list_shopping_entries` with the plan id as mealplan. If it returns entries, that plan is already on the list; skip it. This finds plans added by this skill and plans created with addshopping on. With the `shopping` section at full, `list_shopping_list_recipes` with the plan id as mealplan shows the same thing in one row per recipe.
2. Entries added without a meal plan link do not show up in step 1. Call `list_shopping_entries` without a mealplan to see the open entries; Tandoor returns only unchecked and recently checked entries. If open entries already come from a plan's recipe (match each entry's list_recipe to a recipe with `list_shopping_list_recipes`), treat that plan as already on the list. Note foods that are listed from other recipes or added by hand.

## 4. Skip food on hand

Skip this step if the user does not care about on-hand food.

1. Call `get_recipe` with format "full" for each recipe. Each ingredient has an id and a food. The food carries its food_onhand flag and its supermarket category.
2. Call `list_inventory_entries` to see what is in the pantry, fridge, and freezer. The `inventory` section must be on.
3. Mark each ingredient whose food is on hand, by flag or by inventory. Show the user the marked foods and ask which to leave off. Do not decide for them; an on-hand flag does not say how much is left.

## 5. Act or preview

An explicit request, such as "make a shopping list for my planned dinners", is approval. Add the ingredients, then summarize.

Show a preview first and wait for a yes only when:

- the request is vague, such as "help me with groceries";
- you would replace or delete existing entries;
- you would add more than 40 entries in total. Each ingredient you add becomes one entry.

A preview or a summary is a short table:

| Date | Meal | Recipe | Servings | Left off |
| --- | --- | --- | --- | --- |
| Mon 9 Nov | Dinner | Chicken curry | 4 | rice (on hand) |

## 6. Add the ingredients

Call `add_recipe_to_shopping_list` once per plan that is not already on the list:

- Pass the plan's recipe id as id, the plan's servings, and the plan id as mealplan. Tandoor scales every amount from the recipe's own servings to the number you pass. Servings default to 1 if you omit them, so always pass them. The mealplan link lets the next run find these entries in step 3.
- To leave foods off, pass ingredients with the ids of the ingredients to keep. Omit ingredients to add all of them.
- Never pass servings 0 or a negative number. With a list_recipe id, a negative servings value deletes that shopping-list-recipe.
- Tandoor copies each food's shopping lists onto the new entries. You cannot choose the list in this call. To put the new entries on the list the user picked, collect their ids from `list_shopping_entries` (each entry has a list_recipe) and call `bulk_update_shopping_entries` with shopping_lists_add. The list the user picked is approval for this.

The same recipe planned twice gets two separate groups on the list. That is correct.

## 7. Sort by store layout

1. Call `list_shopping_entries` with format "full". Each entry's food has a supermarket category.
2. Group the entries by that category. Put foods with no category in an "Other" group.
3. If the user names a store, call `list_supermarkets` to find it, then `list_supermarket_category_relations` to get its category order. Sort the groups in that order.

## 8. Summarize

- Show the list grouped by category, with amount, unit, and food.
- Say which plans you added, which you skipped because they were already on the list, and which had no recipe.
- Say which foods you left off as on hand.
- Offer to check items off later. When the user reports what they bought, call `bulk_check_shopping_entries` with those entry ids and checked set to true.

## Safety

- Ask before you remove, uncheck, or replace any entry. Name the entries and wait for a yes.
- Do not delete entries or shopping-list-recipes to clean up duplicates. Show the duplicates and let the user decide.
