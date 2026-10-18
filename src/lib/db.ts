import Dexie, { type Table } from 'dexie'
import type { Product, ShoppingItem, Unit } from './types'

export type SyncedTable = 'products' | 'inventory_units' | 'shopping_items'
export type SyncedRow = Product | Unit | ShoppingItem

export interface OutboxEntry {
  /** `${table}:${row.id}` — later writes to the same row replace earlier ones. */
  key: string
  table: SyncedTable
  row: SyncedRow
  queued_at: number
}

class PantryDB extends Dexie {
  products!: Table<Product, string>
  inventory_units!: Table<Unit, string>
  shopping_items!: Table<ShoppingItem, string>
  outbox!: Table<OutboxEntry, string>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('pantry')
    this.version(1).stores({
      products: 'id, household_id, barcode',
      inventory_units: 'id, household_id, product_id',
      outbox: 'key, queued_at',
      meta: 'key',
    })
    this.version(2).stores({
      shopping_items: 'id, household_id, product_id',
    })
  }
}

export const db = new PantryDB()

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}
