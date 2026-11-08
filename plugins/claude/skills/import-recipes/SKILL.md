---
name: import-recipes
description: Import recipes into Tandoor from a web page, a photo, a scan, a PDF or typed text, then clean up the result (ingredients, foods, units, servings, keywords, image). Use when the user wants to add, save, import or digitize a recipe in Tandoor.
---

# Import recipes into Tandoor

Import the recipe by the route that fits the source. Then review what Tandoor saved and fix it before you report back.

## Choose the route

| Source | Tool | Section |
| --- | --- | --- |
| A web page | `import_recipe_from_url` | `recipes` |
| A photo, scan or PDF | `import_recipe_from_image` | `ai` |
| Text the user typed or pasted | `parse_ingredient`, then `create_recipe` | `foods`, `recipes` |

### Web page

Call `import_recipe_from_url` with the URL. The server first asks Tandoor's scraper to read the page. If that fails, the server fetches the page itself and reads the schema.org recipe data in it. The result names the recipe and its id.

### Photo, scan or PDF

`import_recipe_from_image` sends the file to the AI provider configured in Tandoor. It works only when the space has an AI provider (Tandoor Settings, AI). Call `list_ai_providers` to check. If the list is empty, tell the user an admin must add one, and offer the typed-text route instead.

Give the file in one of two ways:

- file_path: an absolute path on the machine that runs the MCP server.
- file_url: a link to the image or PDF. The server downloads it and uploads the bytes.

When the image is blurry, handwritten or in another language, set save to false first. The tool then returns the parse without saving it. Show the user what the AI read, and import again with save left on once they agree.

### Typed text

Call `parse_ingredient` on each ingredient line to get the amount, unit and food. Each call can create a new food or unit in Tandoor, so check the food names before you continue. Then call `create_recipe` with the name, the steps and their ingredients, and the servings.

## When the URL import fails

`import_recipe_from_url` throws an error that lists each attempt when neither stage finds a recipe. Sites that block bots, need a login or build the page with JavaScript usually fail. Give the user these options:

1. Create a stub. Run `import_recipe_from_url` again with create_stub_on_failure set to true. Tandoor saves an empty recipe that points at the URL, and the user fills it in later.
2. Import from a screenshot. The user saves a screenshot or a PDF of the page, and you import it with `import_recipe_from_image`. This needs an AI provider.
3. Type it in. The user pastes the text and you follow the typed-text route.

## Review and fix the import

Call `get_recipe` on the new id and read it in full. Then check each part below.

**Ingredients.** Imports often split units badly, keep notes inside the food name ("onion, finely chopped"), or create a food that already exists under a slightly different name.

- Fix one ingredient with `update_ingredient`: set the right food, unit, amount or note.
- The scraper may create new foods. Before you keep one, search for an existing food with `list_foods`. Point the ingredient at the existing food instead of keeping a near-duplicate.
- To fold a duplicate food into the existing one, use `merge_food`. For units, use `merge_unit`. Call `get_food` or `get_unit` on both first so you know which one survives.
- Rename a food or unit that has the right identity but the wrong spelling with `update_food` or `update_unit`.

**Servings.** Check that the servings match the source. Set them with `update_recipe`.

**Keywords.** Tandoor's scraper adds the site's tags as keywords, which creates new keywords. Call `list_keywords` to see the tags the user already uses. Replace each new keyword with an existing one where it matches; `update_recipe` takes keyword names. To tag many recipes at once, use `recipe_batch_update`.

**Image.** If the recipe has no image, attach one with `upload_recipe_image`. Pass an image link and Tandoor downloads it itself, which also works for large files.

**Leftovers.** List the keywords and foods the import created that no recipe uses now. Offer to delete them with `delete_keyword` and `delete_food`. Deleting cannot be undone, so ask first.

## Confirm with the user

Report the recipe name and its id, plus the link if you know the Tandoor address. List what you changed and anything you left for the user to decide, such as a food you did not merge.

## Merging is destructive

`merge_food` and `merge_unit` cannot be undone. Every recipe that used the absorbed food or unit moves to the target. Show the user both items and how many recipes use each, then ask before you merge. Never merge units with different base units, such as grams into cups.

## Remote server

A remote server cannot read files on the user's machine, so it refuses file_path uploads. Use file_url with a public link to the image or PDF. If the user only has a local file, ask them to upload it somewhere and share the link.

## Missing tools

Several tools above sit in the full tier of their section: `update_ingredient`, `upload_recipe_image`, `recipe_batch_update`, `merge_food`, `merge_unit`, `update_unit`, `get_unit`, `delete_keyword` and `delete_food`. `import_recipe_from_image` needs the `ai` section, which is off by default.

If a tool is not available after searching for it, call `list_tool_groups`, then act on what it shows:

- Local server: call `enable_tool_group` with the section name: `recipes` or `foods` at the full tier, or `ai`.
- Remote server: the tool group tools do not work there. Tell the user which section to ask the operator to turn on: `recipes` or `foods` set to full, or `ai` set to on.
