import { db } from './db'
import { addUnits, finishOne, isLive, moveUnits, openNew, setLevelLeft, summarize } from './inventory'
import { commit, newId, type Undo } from './store'
import type { Location, Product, ProductDraft, Unit } from './types'

/** Inventory operations as the screens use them: read current state, compute, commit with undo. */

export async function liveUnitsOf(productId: string): Promise<Unit[]> {
  return (await db.inventory_units.where('product_id').equals(productId).toArray()).filter(isLive)
}

export async function onHand(productId: string): Promise<number> {
  return summarize(await liveUnitsOf(productId)).total
}

export interface Result {
  undo: Undo
  remaining: number
}

async function apply(product: Product, units: Unit[]): Promise<Result> {
  const undo = await commit({ units })
  return { undo, remaining: await onHand(product.id) }
}

export async function putAway(
  product: Product,
  opts: { location?: Location; count?: number; useBy?: string | null } = {},
): Promise<Result> {
  const units = addUnits(product, opts.location ?? product.default_location, opts.count ?? 1, opts.useBy ?? null, newId)
  return apply(product, units)
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
  return { product, undo, remaining: opts.count }
}

export async function updateProduct(product: Product, patch: Partial<Product>): Promise<Undo> {
  return commit({ products: [{ ...product, ...patch, updated_at: new Date().toISOString() }] })
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
  return apply(product, changes)
}

export async function moveGroup(product: Product, units: Unit[], to: Location): Promise<Undo> {
  return commit({ units: moveUnits(units, product, to) })
}

export async function updateUnit(unit: Unit, patch: Partial<Unit>): Promise<Undo> {
  return commit({ units: [{ ...unit, ...patch, updated_at: new Date().toISOString() }] })
}

export async function removeUnits(units: Unit[]): Promise<Undo> {
  const at = new Date().toISOString()
  return commit({ units: units.map((u) => ({ ...u, deleted_at: at, updated_at: at })) })
}
