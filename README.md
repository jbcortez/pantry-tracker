# Pantry Tracker

A shared household food inventory that installs on your phone. Scan barcodes as you put
groceries away and as you cook, see what's about to expire, and (soon) get recipes from
what you already have.

- **Spec:** [docs/SPEC.md](docs/SPEC.md)
- **Setup:** [docs/SETUP.md](docs/SETUP.md) (about 15 minutes, free accounts)

## Status

| Phase | |
|---|---|
| 1. Inventory & scanning | ✅ Built |
| 2. Shopping list | ✅ Built |
| 3. Recipes | ✅ Built |

## What's in Phase 1

- **Putting Away mode:** scan, and known items are added instantly. New items open a
  prefilled card (Open Food Facts → UPCitemdb → manual), saved once for the household.
- **Cooking mode:** scan to use up. Cans are removed instantly; flour and oil ask
  *Used it all / Used some / Opened a new one*.
- **No-barcode quick add** for produce, meat and leftovers.
- **Auto categories, locations and use-by estimates.** "Use soon" list for anything
  expiring within 3 days.
- **Undo on everything**, shared household with invite links, **works offline**.

## What's in Phase 2

- **Shared shopping list** grouped by aisle, with suggestions from things you've bought before
  and "Have: …" next to each item.
- **Staples** (★): put themselves on the list when they run out or the last one is down to ¼.
- **Ran out** prompt when a non-staple hits zero.
- Checking off doesn't touch the inventory; scanning groceries in ticks list items off.

## What's in Phase 3

- **Recipes with Claude:** the Pantry connector (for the Claude app on phone, desktop and web) and the
  `pantry` CLI (for Claude Code) let your regular Claude read the kitchen, with the expiring items first
  and your household preferences, then save recipes and add to the shopping list.
  Set up under **Settings → Claude** (setup step 5).
- **Recipe box:** recipes Claude saves are sorted into *Ready to make*, *Missing 1* and *Missing more*
  from the live inventory.
- **Add missing to list**, tagged with the recipe.
- **Cook this:** opens Cooking mode with the recipe as a checklist; each ingredient is one
  tap (or one scan) to deduct.

## Code map

| Path | |
|---|---|
| `src/lib/inventory.ts` | Quantity model: pure operations on packages |
| `src/lib/shopping.ts` | Staple / low-stock / list rules |
| `src/lib/recipes.ts` | Ingredient ↔ inventory matching |
| `src/lib/categories.ts`, `shelfLife.ts` | Auto category / location / use-by rules |
| `src/lib/lookup.ts` | Barcode lookup chain |
| `src/lib/store.ts`, `sync.ts`, `db.ts` | Local-first storage, outbox, Supabase sync |
| `src/components/Scanner.tsx` | Camera + barcode decoding |
| `src/screens/` | Kitchen, Scan, Settings, sign-in |
| `supabase/schema.sql` | Database tables and access rules. **Re-run it in the Supabase SQL Editor after each new phase.** |
| `api/upc.ts` | Vercel function proxying UPCitemdb |
| `api/mcp.ts`, `api/agent.ts`, `api/_lib/agent.ts` | Claude connector (MCP) and CLI endpoint, authorized by per-household keys |
| `cli/pantry.mjs` | `pantry` CLI (no dependencies) |
| `.claude/skills/pantry/` | Teaches Claude Code to use the CLI |

```bash
npm install && npm run dev   # local, device-only mode
npm test                     # unit tests
npm run build                # typecheck + production build
```
