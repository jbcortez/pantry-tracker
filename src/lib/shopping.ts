import { isLive, summarize } from './inventory.js'
import type { Product, ShoppingItem, ShoppingSource, Unit } from './types.js'

/** Pure shopping-list rules. */

/** Out, or down to the last quarter of the last package. */
export function isLow(units: Unit[]): boolean {
  const s = summarize(units)
  return s.total === 0 || (s.unopened === 0 && s.openLevel != null && s.openLevel <= 0.25)
}

/** Units after applying changes, as the database will see them. */
export function afterChanges(current: Unit[], changes: Unit[]): Unit[] {
  const byId = new Map(current.map((u) => [u.id, u]))
  for (const c of changes) byId.set(c.id, c)
  return [...byId.values()].filter(isLive)
}

export function isOpen(item: ShoppingItem): boolean {
  return !item.deleted_at && !item.checked_at
}

export function openItemFor(productId: string, items: ShoppingItem[]): ShoppingItem | undefined {
  return items.find((i) => i.product_id === productId && isOpen(i))
}

export function newShoppingItem(
  householdId: string,
  fields: { name: string; category: string; product_id?: string | null; note?: string | null },
  source: ShoppingSource,
  newId: () => string,
  now = new Date(),
): ShoppingItem {
  const at = now.toISOString()
  return {
    id: newId(),
    household_id: householdId,
    product_id: fields.product_id ?? null,
    name: fields.name,
    category: fields.category,
    note: fields.note ?? null,
    source,
    checked_at: null,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  }
}

export function itemForProduct(product: Product, source: ShoppingSource, newId: () => string, now = new Date()) {
  return newShoppingItem(
    product.household_id,
    { name: product.name, category: product.category, product_id: product.id },
    source,
    newId,
    now,
  )
}

/** A staple that just ran low gets listed, unless it's already on the list. */
export function stapleListing(
  product: Product,
  unitsAfter: Unit[],
  items: ShoppingItem[],
  newId: () => string,
  now = new Date(),
): ShoppingItem | null {
  if (!product.staple || !isLow(unitsAfter) || openItemFor(product.id, items)) return null
  return itemForProduct(product, 'staple', newId, now)
}

/** Putting groceries away ticks off what was on the list for them. */
export function checkOffFor(productId: string, items: ShoppingItem[], now = new Date()): ShoppingItem[] {
  const at = now.toISOString()
  return items.filter((i) => i.product_id === productId && isOpen(i)).map((i) => ({ ...i, checked_at: at, updated_at: at }))
}
