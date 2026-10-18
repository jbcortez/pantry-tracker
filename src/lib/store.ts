import { db, type SyncedRow, type SyncedTable } from './db'
import { supabase } from './supabase'
import { scheduleFlush } from './sync'
import type { Product, ShoppingItem, Unit } from './types'

export interface Changes {
  products?: Product[]
  units?: Unit[]
  shopping?: ShoppingItem[]
}

export type Undo = () => Promise<void>

export const newId = () => crypto.randomUUID()

const TABLE_OF: Record<keyof Changes, SyncedTable> = {
  products: 'products',
  units: 'inventory_units',
  shopping: 'shopping_items',
}

async function write(table: SyncedTable, rows: SyncedRow[]) {
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
  const keys = (Object.keys(TABLE_OF) as (keyof Changes)[]).filter((k) => changes[k]?.length)
  const before = new Map<keyof Changes, (SyncedRow | undefined)[]>()

  await db.transaction('rw', [db.products, db.inventory_units, db.shopping_items, db.outbox], async () => {
    for (const k of keys) {
      const rows = changes[k] as SyncedRow[]
      before.set(k, await db.table(TABLE_OF[k]).bulkGet(rows.map((r) => r.id)))
      await write(TABLE_OF[k], rows)
    }
  })
  scheduleFlush()

  return async () => {
    const at = new Date().toISOString()
    const restore: Changes = {}
    for (const k of keys) {
      const prev = before.get(k)!
      // Rows that didn't exist before are soft-deleted; others go back to how they were.
      restore[k] = (changes[k] as SyncedRow[]).map((cur, i) =>
        prev[i] ? { ...prev[i]!, updated_at: at } : { ...cur, deleted_at: at, updated_at: at },
      ) as never
    }
    await commit(restore)
  }
}
