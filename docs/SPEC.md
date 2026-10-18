# Pantry Tracker — Product Spec

A shared household food inventory. Scan barcodes to add and use up food, see what is
about to expire, shop for what's missing, and get recipes built from what you already have.

Goal: **know what's in the kitchen, waste less, shop better.**

---

## 1. Platform & users

| Decision | Choice |
|---|---|
| Form factor | **Progressive Web App** — a website installed to the phone home screen. Works on iPhone (Safari) and Android (Chrome); also usable on a laptop. |
| Users | **Shared household.** Everyone in the home sees and edits the same inventory, live. |
| Sign-in | **Email one-time code / magic link** (no passwords). The email contains both a link and a 6-digit code; the code is what makes it work inside an installed iPhone app, which doesn't share a login with Safari. |
| Joining | The first person creates the household and shares an **invite link**. Anyone who opens it and signs in joins. All members are equal — no admin role. |
| Offline | **Offline-tolerant.** The inventory is cached on the phone; scans made without signal are queued and sync automatically when the connection returns. |

## 2. What is tracked

**All food**: pantry, fridge, freezer and fresh produce.

Every item has two independent attributes:

- **Category** — *what it is* (aisle-style, see §5).
- **Location** — *where it is*: **Pantry**, **Fridge**, or **Freezer**.

Frozen peas are *Produce* in the *Freezer*.

## 3. Quantity model (hybrid)

Each product is tracked one of two ways (auto-chosen by category, changeable per product):

- **Count** — discrete things: cans, eggs-by-carton, onions, chicken breasts packs.
  Shown as `3`.
- **Level** — things used a bit at a time: flour, olive oil, peanut butter, milk.
  Shown as `2 unopened + 1 open (~½)`. The open package's level is one of
  **Full / ¾ / ½ / ¼**.

No unit conversions (cups ↔ grams) anywhere. The app knows *what you have and roughly how much*.

Internally each physical package is its own record ("unit") with its own use-by date and
level. This makes multi-phone sync merge cleanly (two people adding cans at once both count).

## 4. Expiration

- When an item is added, its **use-by date is estimated automatically** from its category,
  location and name (e.g. milk 7 days, fresh chicken 2 days, bagged salad 5, canned goods
  ~2 years, freezer ~6 months).
- Optional: tap to override with the printed date.
- **Moving** an item recalculates (chicken moved to the freezer gets months, not days).
- **Opening** an item can shorten its window (opened jar of salsa → ~2 weeks).
- A **"Use soon"** list sits at the top of the home screen: expired items and anything due
  within 3 days.
- Reading printed dates with the camera (OCR) is out of scope for now.

## 5. Categories

Automatically assigned — from Open Food Facts category tags and product-name keywords —
and **corrections are remembered** for that product for the whole household.

Default list (aisle-ordered so it also reads well while shopping):

1. Produce
2. Meat & Seafood
3. Dairy & Eggs
4. Bread & Bakery
5. Deli & Leftovers
6. Canned & Jarred
7. Pasta, Rice & Grains
8. Baking
9. Spices & Seasonings
10. Oils, Sauces & Condiments
11. Breakfast & Cereal
12. Snacks
13. Frozen Meals & Desserts
14. Beverages
15. Other

Categories can be renamed and new ones added in Settings.

Inventory view: grouped **by category** by default, one-tap switch to **by location** or
**expiring soonest**. Search across everything.

## 6. Barcode lookup

Lookup order when a barcode is scanned:

1. **Household barcode memory** — any product anyone in the household has scanned or
   corrected before. Instant, works offline.
2. **Open Food Facts** — free, open, no key.
3. **UPCitemdb** (free trial tier, ~100 lookups/day) — better US store-brand coverage.
   Called through a tiny server function to avoid browser CORS limits.
4. **Quick manual form** — prefilled with whatever was found, saved to barcode memory so
   it's instant next time.

Primary market: **United States**.

## 7. Scanning flows

One **Scan** screen with a mode toggle: **Putting Away | Cooking**. The camera stays
live between scans. The same barcode only re-triggers after it leaves the frame, so
holding a can steady doesn't add it five times — but scanning it, moving it away, and
scanning again adds another.

### Putting Away (unloading groceries)
- **Known product** → added instantly (+1) with a toast: *"Black Beans · 3 on hand · Undo"*.
  Zero taps.
- **New product** → a confirm card (name, brand, category, location, use-by — all
  prefilled) → one **Save** tap.
- **"+ No barcode"** button → quick-add list of common produce and fridge staples
  (tap "Onion" → added), plus a typed search / custom item.

### Cooking (using things up)
- **Count item** → removed instantly (−1) with **Undo**.
- **Level item** → sheet with three big buttons:
  - **Used it all**
  - **Used some →** pick how much is left (¾ / ½ / ¼)
  - **Opened a new one**
- **No-barcode items** → a strip of *"In your kitchen"* chips under the camera
  (fridge & produce items, soonest-expiring first). Tap to use.
- **Scanned something not in inventory** → *"Not in your kitchen — Ignore / Add it"*. No dead ends.

### Everywhere
- Every change has **Undo**.
- When an item reaches zero it disappears from the inventory; the product stays in
  barcode memory.
- A manual "type the barcode" fallback exists for damaged labels or no camera.

## 8. Shopping list (Phase 2)

- Shared, grouped by aisle category.
- **Staples**: mark items as "always keep stocked"; auto-added to the list when they hit
  zero or the open level drops to ¼.
- **Recipe gaps**: saved recipes missing an ingredient get *"Add missing to list"*.
- **Ran out**: when a non-staple hits zero, a toast offers *"Add to shopping list?"*.
- **Checking off an item does NOT add it to inventory** — the put-away scan at home does,
  avoiding double counting.
- Scanning an item in **Putting Away** ticks its list entry off automatically.
- Each list entry shows how much you still have ("Have: ½ open"), handy in the store.

## 9. Recipes (Phase 3)

- **"What can I make?"** — AI-generated recipes (Claude) from the current inventory,
  weighted toward soon-to-expire items. Optional filters: time, servings, cuisine.
  Assumes common staples (salt, pepper, water). Suggests 3–5 dishes.
- **Household recipe box** — save generated recipes you liked, or import from a URL.
  Each saved recipe is matched against inventory: *Ready to make* / *Missing 1*.
- **"Cook this"** — opens Cooking mode preloaded with that recipe's ingredients as a
  checklist to deduct.
- Household preference notes (dietary rules, dislikes) live in Settings; none today.
- The AI key lives server-side only, and the endpoints require a signed-in household member.
- Model: Claude Opus 5.5 with structured output, so recipes always parse; server-side
  fallback is enabled so a declined request is retried on another model automatically.
- Import reads schema.org Recipe data when the page has it (most recipe sites do), else the
  page text; pasted text works for sites that block it.

## 10. Tech stack

| Layer | Choice |
|---|---|
| App | React + TypeScript + Vite, Tailwind CSS, `vite-plugin-pwa` |
| Local storage | IndexedDB via Dexie (offline cache + outbound change queue) |
| Barcode decoding | Native `BarcodeDetector` where available (Android Chrome); ZXing-WASM fallback (iPhone), bundled locally so it works offline |
| Backend | Supabase — Postgres, auth, realtime, row-level security per household |
| Server functions | Vercel Functions (`/api/*`) — UPCitemdb proxy now, Claude calls in Phase 3 |
| Hosting | Vercel (free); auto-deploys on push. HTTPS is required for camera access. |
| Cost | Free tiers + small per-use AI cost in Phase 3 |

### Sync design
- Every row has a client-generated UUID, a server-set `updated_at`, and a soft-delete
  `deleted_at`.
- Writes apply to the local database immediately and are queued in an outbox; the outbox
  pushes to Supabase whenever online.
- Changes from other phones arrive via Supabase Realtime, plus an incremental pull
  (`updated_at > last cursor`) on start-up, reconnect and app focus.
- Conflicts on the same row resolve last-write-wins. Because each physical package is its
  own row, concurrent adds never conflict; the only lossy case is two people changing the
  *same* package at the same moment.

## 11. Phases

| Phase | Scope |
|---|---|
| **1 — Inventory & scanning** | Household + invite link, sign-in, Putting Away & Cooking scan modes, lookup chain + barcode memory, produce quick-add, auto categories, count/level quantities, expiry estimates, Use-soon list, inventory views, item editing, undo, offline cache + queue, installable PWA. |
| **2 — Shopping list** | Shared aisle-grouped list, staples auto-add, ran-out prompts. |
| **3 — Recipes** | AI "What can I make?", recipe box + URL import, inventory matching, Cook this. |
