import type { RealtimeChannel } from '@supabase/supabase-js'
import { db, getMeta, setMeta, type OutboxEntry, type SyncedRow, type SyncedTable } from './db'
import { supabase } from './supabase'

/**
 * Offline-tolerant sync.
 * - Local writes land in IndexedDB and an outbox (see store.ts).
 * - flush() pushes the outbox whenever we're online.
 * - pull() fetches rows changed since the last cursor; realtime pushes the rest live.
 * Conflicts are last-write-wins per row; each physical package is its own row, so
 * concurrent adds from two phones never collide.
 */

const TABLES: SyncedTable[] = ['products', 'inventory_units', 'shopping_items'] // FK order
/** Re-read a little before the cursor so rows committed out of order aren't missed. */
const CURSOR_OVERLAP_MS = 10_000
const PAGE = 500

let householdId: string | null = null
let flushing: Promise<void> | null = null
let flushTimer: ReturnType<typeof setTimeout> | undefined

export function scheduleFlush(delay = 300) {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => void flush(), delay)
}

export async function flush(): Promise<void> {
  if (!supabase || !navigator.onLine) return
  if (flushing) return flushing
  flushing = (async () => {
    try {
      const entries = await db.outbox.orderBy('queued_at').toArray()
      for (const table of TABLES) {
        const batch = entries.filter((e) => e.table === table)
        for (let i = 0; i < batch.length; i += PAGE) {
          const chunk = batch.slice(i, i + PAGE)
          const { error } = await supabase!.from(table).upsert(chunk.map((e) => e.row))
          if (error) throw error
          await removeIfUnchanged(chunk)
        }
      }
    } catch (err) {
      console.warn('Sync push failed; will retry', err)
      scheduleFlush(15_000)
    } finally {
      flushing = null
    }
  })()
  return flushing
}

/** Drop pushed entries, unless the row was edited again while the push was in flight. */
async function removeIfUnchanged(pushed: OutboxEntry[]) {
  await db.transaction('rw', db.outbox, async () => {
    const current = await db.outbox.bulkGet(pushed.map((e) => e.key))
    const done = pushed.filter((e, i) => current[i]?.queued_at === e.queued_at).map((e) => e.key)
    await db.outbox.bulkDelete(done)
  })
}

async function applyRemote(table: SyncedTable, rows: SyncedRow[]) {
  if (!rows.length) return
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    const pending = await db.outbox.bulkGet(rows.map((r) => `${table}:${r.id}`))
    // A local change waiting to be pushed is newer than what the server has.
    const accepted = rows.filter((_, i) => !pending[i])
    await db.table(table).bulkPut(accepted)
  })
}

export async function pull(): Promise<void> {
  if (!supabase || !householdId || !navigator.onLine) return
  const hid = householdId
  for (const table of TABLES) {
    const cursorKey = `cursor:${hid}:${table}`
    const cursor = (await getMeta<string>(cursorKey)) ?? '1970-01-01T00:00:00Z'
    const since = new Date(new Date(cursor).getTime() - CURSOR_OVERLAP_MS).toISOString()
    let newest = cursor
    // Keyset paging on (updated_at, id): one bulk write gives many rows the same timestamp.
    let after: { ts: string; id: string } | null = null
    for (;;) {
      let query = supabase.from(table).select('*').eq('household_id', hid)
      query = after
        ? query.or(`updated_at.gt."${after.ts}",and(updated_at.eq."${after.ts}",id.gt.${after.id})`)
        : query.gt('updated_at', since)
      const { data, error } = await query.order('updated_at').order('id').limit(PAGE)
      if (error) {
        console.warn('Sync pull failed', error)
        return
      }
      await applyRemote(table, data as SyncedRow[])
      if (!data.length) break
      const last = data[data.length - 1] as SyncedRow
      newest = last.updated_at
      after = { ts: last.updated_at, id: last.id }
      if (data.length < PAGE) break
    }
    await setMeta(cursorKey, newest)
  }
}

/** Begin syncing a household. Returns a stop function. */
export function startSync(hid: string, onHouseholdChange: () => void): () => void {
  if (!supabase) return () => {}
  householdId = hid
  const sb = supabase

  let channel: RealtimeChannel = sb.channel(`household:${hid}`)
  for (const table of TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `household_id=eq.${hid}` },
      (payload) => {
        if (payload.new && 'id' in payload.new) void applyRemote(table, [payload.new as SyncedRow])
      },
    )
  }
  channel = channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${hid}` },
    onHouseholdChange,
  )
  channel.subscribe((status) => {
    // (Re)connected: catch up on anything missed while disconnected.
    if (status === 'SUBSCRIBED') void pull()
  })

  const catchUp = () => {
    void flush().then(pull)
  }
  const onVisible = () => document.visibilityState === 'visible' && catchUp()
  window.addEventListener('online', catchUp)
  document.addEventListener('visibilitychange', onVisible)
  const interval = setInterval(catchUp, 60_000)
  catchUp()

  return () => {
    householdId = null
    void sb.removeChannel(channel)
    window.removeEventListener('online', catchUp)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(interval)
  }
}
