import { estimateUseBy, useByAfterOpening } from './shelfLife'
import type { Location, Product, Unit } from './types'

/**
 * Pure inventory operations. Each takes the live units of one product and returns the
 * rows to write (new state, including soft-deletes). Nothing here touches storage.
 */

export const LEVELS = [1, 0.75, 0.5, 0.25] as const

export function levelLabel(level: number): string {
  if (level >= 0.95) return 'Full'
  if (level >= 0.7) return '¾'
  if (level >= 0.45) return '½'
  return '¼'
}

const nowISO = (now: Date) => now.toISOString()

export function isLive(u: Unit): boolean {
  return u.deleted_at == null
}

/** The package you'd reach for next: the open one, else the one expiring first, else the oldest. */
export function nextUp(units: Unit[]): Unit | undefined {
  const live = units.filter(isLive)
  const open = live.filter((u) => u.opened_at).sort((a, b) => a.level - b.level)[0]
  if (open) return open
  return [...live].sort(
    (a, b) => (a.use_by ?? '9999').localeCompare(b.use_by ?? '9999') || a.added_at.localeCompare(b.added_at),
  )[0]
}

function firstUnopened(units: Unit[]): Unit | undefined {
  return nextUp(units.filter((u) => isLive(u) && !u.opened_at))
}

function remove(u: Unit, now: Date): Unit {
  return { ...u, deleted_at: nowISO(now), updated_at: nowISO(now) }
}

function open(u: Unit, product: Product, now: Date, level = 1): Unit {
  return {
    ...u,
    level,
    opened_at: u.opened_at ?? nowISO(now),
    use_by: useByAfterOpening(u.use_by, product.category, u.location, product.name, now),
    updated_at: nowISO(now),
  }
}

export function addUnits(
  product: Product,
  location: Location,
  count: number,
  useBy: string | null,
  newId: () => string,
  now = new Date(),
): Unit[] {
  const use_by = useBy ?? estimateUseBy(product.category, location, product.name, now)
  return Array.from({ length: count }, () => ({
    id: newId(),
    household_id: product.household_id,
    product_id: product.id,
    location,
    level: 1,
    opened_at: null,
    use_by,
    added_at: nowISO(now),
    updated_at: nowISO(now),
    deleted_at: null,
  }))
}

/** "Used 1" for count items, "Used it all" for level items: the next-up package is gone. */
export function finishOne(units: Unit[], now = new Date()): Unit[] {
  const target = nextUp(units)
  return target ? [remove(target, now)] : []
}

/** "Used some": the open package (opening one if needed) now has `level` left. */
export function setLevelLeft(units: Unit[], product: Product, level: number, now = new Date()): Unit[] {
  const target = nextUp(units)
  if (!target) return []
  if (level <= 0) return [remove(target, now)]
  return [open(target, product, now, level)]
}

/** "Opened a new one": the current open package is finished and a fresh one is opened. */
export function openNew(units: Unit[], product: Product, now = new Date()): Unit[] {
  const live = units.filter(isLive)
  const current = live.find((u) => u.opened_at)
  const changes: Unit[] = current ? [remove(current, now)] : []
  const fresh = firstUnopened(live)
  if (fresh) changes.push(open(fresh, product, now))
  return changes
}

export function moveUnits(units: Unit[], product: Product, to: Location, now = new Date()): Unit[] {
  return units.filter(isLive).map((u) => {
    let use_by = estimateUseBy(product.category, to, product.name, now)
    if (u.opened_at) use_by = useByAfterOpening(use_by, product.category, to, product.name, now) ?? use_by
    // Moving between pantry and fridge never extends a printed date you entered yourself.
    if (to !== 'freezer' && u.location !== 'freezer' && u.use_by && u.use_by < use_by) use_by = u.use_by
    return { ...u, location: to, use_by, updated_at: nowISO(now) }
  })
}

export interface Summary {
  total: number
  unopened: number
  openLevel: number | null
  nextUseBy: string | null
}

export function summarize(units: Unit[]): Summary {
  const live = units.filter(isLive)
  const opened = live.filter((u) => u.opened_at)
  const nextUseBy = live.reduce<string | null>((m, u) => (u.use_by && (!m || u.use_by < m) ? u.use_by : m), null)
  return {
    total: live.length,
    unopened: live.length - opened.length,
    openLevel: opened.length ? Math.min(...opened.map((u) => u.level)) : null,
    nextUseBy,
  }
}

/** "3", or for level items "2 + ½ open". */
export function describeQuantity(product: Product, units: Unit[]): string {
  const s = summarize(units)
  if (product.tracking === 'count' || s.openLevel == null) return String(s.total)
  const openPart = `${levelLabel(s.openLevel)} open`
  return s.unopened ? `${s.unopened} + ${openPart}` : openPart
}
