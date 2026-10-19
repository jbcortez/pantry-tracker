---
name: pantry
description: Read the household's Pantry inventory and shopping list, save recipes to its recipe box, and add to its shopping list, using the `pantry` CLI. Use when asked what to cook, for meal or recipe ideas from what's on hand, what's expiring, or to save a recipe or shopping items to Pantry.
---

# Pantry

`pantry` talks to the household's Pantry app. If `pantry` isn't on the PATH, run `node cli/pantry.mjs` from this repo instead (same arguments). If it says it isn't set up, ask for the app URL and a key from the app's **Settings → Claude**, then run `pantry setup <app-url> <key>`.

| Command | Does |
|---|---|
| `pantry inventory [--location pantry\|fridge\|freezer]` | What's in the kitchen, with a **USE SOON** section and the household's food preferences |
| `pantry list` | Current shopping list |
| `pantry save-recipe [file.json]` | Save a recipe (JSON on stdin or in a file); replies with which ingredients are on hand |
| `pantry add-to-list <item>... [--note "For <recipe>"]` | Add to the shopping list; duplicates are skipped |

Recipe JSON: `{"title", "summary", "time_minutes", "servings", "ingredients": [{"name", "amount"}], "steps": ["..."]}`. Use generic ingredient names ("black beans"); the app matches them to what's on the shelf.

## Suggesting meals

1. Run `pantry inventory` first. Build ideas around the USE SOON items, and follow the household preferences it prints.
2. Assume only salt, pepper and water beyond what's listed. Say clearly which ingredients they'd need to buy.
3. Save the recipes the person picks with `pantry save-recipe`, so they show up in the app's recipe box (where "Cook this" deducts ingredients as they cook). If they want, add the missing items with `pantry add-to-list --note "For <title>"`.
