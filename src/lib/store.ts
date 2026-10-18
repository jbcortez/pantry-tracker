import { db, type SyncedTable } from './db'
import { supabase } from './supabase'
import { scheduleFlush } from './sync'
import type { Product, Unit } from './types'

export interface Changes {
  products?: Product[]
  units?: Unit[]
}

export type Undo = () => Promise<void>

export const newId = () => crypto.randomUUID()

async function write(table: SyncedTable, rows: (Product | Unit)[]) {
  if (!rows.length) return
  await db.table(table).bulkPut(rows)
  if (supabase) {
    const queued_at = Date.now()
    await db.outbox.bulkPut(rows.map((row) => ({ key: `${table}:${row.id}`, table, row, queued_at })))
  }
}

/**
 * Apply changes locally right away, queue them for sync, and return an undo that
 * restores exactly the rows that were touched.
 */
export async function commit(changes: Changes): Promise<Undo> {
  const products = changes.products ?? []
  const units = changes.units ?? []
  let prevProducts: (Product | undefined)[] = []
  let prevUnits: (Unit | undefined)[] = []

  await db.transaction('rw', db.products, db.inventory_units, db.outbox, async () => {
    prevProducts = await db.products.bulkGet(products.map((p) => p.id))
    prevUnits = await db.inventory_units.bulkGet(units.map((u) => u.id))
    await write('products', products)
    await write('inventory_units', units)
  })
  scheduleFlush()

  return async () => {
    const at = new Date().toISOString()
    const restore = <T extends Product | Unit>(prev: T | undefined, cur: T): T =>
      prev ? { ...prev, updated_at: at } : { ...cur, deleted_at: at, updated_at: at }
    await commit({
      products: products.map((p, i) => restore(prevProducts[i], p)),
      units: units.map((u, i) => restore(prevUnits[i], u)),
    })
  }
}
