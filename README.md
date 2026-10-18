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
| 2. Shopping list | Planned |
| 3. Recipes | Planned |

## What's in Phase 1

- **Putting Away mode:** scan, and known items are added instantly. New items open a
  prefilled card (Open Food Facts → UPCitemdb → manual), saved once for the household.
- **Cooking mode:** scan to use up. Cans are removed instantly; flour and oil ask
  *Used it all / Used some / Opened a new one*.
- **No-barcode quick add** for produce, meat and leftovers.
- **Auto categories, locations and use-by estimates.** "Use soon" list for anything
  expiring within 3 days.
- **Undo on everything**, shared household with invite links, **works offline**.

## Code map

| Path | |
|---|---|
| `src/lib/inventory.ts` | Quantity model: pure operations on packages |
| `src/lib/categories.ts`, `shelfLife.ts` | Auto category / location / use-by rules |
| `src/lib/lookup.ts` | Barcode lookup chain |
| `src/lib/store.ts`, `sync.ts`, `db.ts` | Local-first storage, outbox, Supabase sync |
| `src/components/Scanner.tsx` | Camera + barcode decoding |
| `src/screens/` | Kitchen, Scan, Settings, sign-in |
| `supabase/schema.sql` | Database tables and access rules |
| `api/upc.ts` | Vercel function proxying UPCitemdb |

```bash
npm install && npm run dev   # local, device-only mode
npm test                     # unit tests
npm run build                # typecheck + production build
```
