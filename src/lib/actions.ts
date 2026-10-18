import { db } from './db'
import { addUnits, finishOne, isLive, moveUnits, openNew, setLevelLeft, summarize } from './inventory'
import { afterChanges, checkOffFor, isLow, itemForProduct, newShoppingItem, openItemFor, stapleListing } from './shopping'
import { commit, newId, type Undo } from './store'
import type { Location, Product, ProductDraft, ShoppingItem, ShoppingSource, Unit } from './types'

/** Inventory operations as the screens use them: read current state, compute, commit with undo. */

export async function liveUnitsOf(productId: string): Promise<Unit[]> {
  return (await db.inventory_units.where('product_id').equals(productId).toArray()).filter(isLive)
}

export async function onHand(productId: string): Promise<number> {
  return summarize(await liveUnitsOf(productId)).total
}

async function listItemsFor(productId: string): Promise<ShoppingItem[]> {
  return db.shopping_items.where('product_id').equals(productId).toArray()
}

export interface Result {
  undo: Undo
  remaining: number
  /** A staple ran low and was put on the shopping list. */
  listed: boolean
  /** Not a staple, now gone, and not on the list — worth offering to add it. */
  ranOut: boolean
}

/**
 * Commit unit changes for one product together with their shopping-list consequences,
 * so a single undo reverts both.
 */
async function applyUnits(product: Product, current: Unit[], changes: Unit[]): Promise<Result> {
  const after = afterChanges(current, changes)
  const items = await listItemsFor(product.id)
  const listing = stapleListing(product, after, items, newId)
  const undo = await commit({ units: changes, shopping: listing ? [listing] : [] })
  const remaining = after.length
  return {
    undo,
    remaining,
    listed: !!listing,
    ranOut: remaining === 0 && !listing && !openItemFor(product.id, items),
  }
}

export async function putAway(
  product: Product,
  opts: { location?: Location; count?: number; useBy?: string | null } = {},
): Promise<Result> {
  const units = addUnits(product, opts.location ?? product.default_location, opts.count ?? 1, opts.useBy ?? null, newId)
  // Bought it: tick it off the list (the scan is what adds it to the inventory).
  const checked = checkOffFor(product.id, await listItemsFor(product.id))
  const undo = await commit({ units, shopping: checked })
  return { undo, remaining: await onHand(product.id), listed: false, ranOut: false }
}

export async function createProduct(
  householdId: string,
  draft: ProductDraft,
  opts: { location: Location; count: number; useBy: string | null },
): Promise<{ product: Product } & Result> {
  const now = new Date().toISOString()
  const product: Product = {
    ...draft,
    id: newId(),
    household_id: householdId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  const units = opts.count > 0 ? addUnits(product, opts.location, opts.count, opts.useBy, newId) : []
  const undo = await commit({ products: [product], units })
  return { product, undo, remaining: opts.count, listed: false, ranOut: false }
}

export async function updateProduct(product: Product, patch: Partial<Product>): Promise<Undo> {
  return commit({ products: [{ ...product, ...patch, updated_at: new Date().toISOString() }] })
}

/** Marking something a staple while it's already low lists it right away. */
export async function setStaple(product: Product, staple: boolean): Promise<{ undo: Undo; listed: boolean }> {
  const updated = { ...product, staple, updated_at: new Date().toISOString() }
  const listing = staple ? stapleListing(updated, await liveUnitsOf(product.id), await listItemsFor(product.id), newId) : null
  const undo = await commit({ products: [updated], shopping: listing ? [listing] : [] })
  return { undo, listed: !!listing }
}

export type UseChoice = { kind: 'one' } | { kind: 'left'; level: number } | { kind: 'openNew' }

export async function consume(product: Product, choice: UseChoice): Promise<Result> {
  const units = await liveUnitsOf(product.id)
  const changes =
    choice.kind === 'one'
      ? finishOne(units)
      : choice.kind === 'left'
        ? setLevelLeft(units, product, choice.level)
        : openNew(units, product)
  return applyUnits(product, units, changes)
}

export async function moveGroup(product: Product, units: Unit[], to: Location): Promise<Undo> {
  return commit({ units: moveUnits(units, product, to) })
}

export async function updateUnit(product: Product, unit: Unit, patch: Partial<Unit>): Promise<Result> {
  const change = { ...unit, ...patch, updated_at: new Date().toISOString() }
  return applyUnits(product, await liveUnitsOf(product.id), [change])
}

export async function removeUnits(product: Product, units: Unit[]): Promise<Result> {
  const at = new Date().toISOString()
  const changes = units.map((u) => ({ ...u, deleted_at: at, updated_at: at }))
  return applyUnits(product, await liveUnitsOf(product.id), changes)
}

// ───────────── Shopping list ─────────────

/** Add a known product to the list (no duplicate if it's already there). */
export async function addProductToList(product: Product, source: ShoppingSource = 'manual'): Promise<Undo | null> {
  if (openItemFor(product.id, await listItemsFor(product.id))) return null
  return commit({ shopping: [itemForProduct(product, source, newId)] })
}

export async function addToList(
  householdId: string,
  fields: { name: string; category: string; product_id?: string | null; note?: string | null },
): Promise<Undo> {
  return commit({ shopping: [newShoppingItem(householdId, fields, 'manual', newId)] })
}

export async function updateListItem(item: ShoppingItem, patch: Partial<ShoppingItem>): Promise<Undo> {
  return commit({ shopping: [{ ...item, ...patch, updated_at: new Date().toISOString() }] })
}

export async function removeListItems(items: ShoppingItem[]): Promise<Undo> {
  const at = new Date().toISOString()
  return commit({ shopping: items.map((i) => ({ ...i, deleted_at: at, updated_at: at })) })
}

/** List every staple that's low and not already on the list. */
export async function listLowStaples(householdId: string): Promise<{ undo: Undo; count: number }> {
  const staples = (await db.products.where('household_id').equals(householdId).toArray()).filter(
    (p) => p.staple && !p.deleted_at,
  )
  const additions: ShoppingItem[] = []
  for (const p of staples) {
    const units = await liveUnitsOf(p.id)
    if (isLow(units) && !openItemFor(p.id, await listItemsFor(p.id))) additions.push(itemForProduct(p, 'staple', newId))
  }
  return { undo: await commit({ shopping: additions }), count: additions.length }
}
