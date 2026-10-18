import { describe, expect, it } from 'vitest'
import { daysUntil } from './dates'
import { addUnits, describeQuantity, finishOne, moveUnits, nextUp, openNew, setLevelLeft, summarize } from './inventory'
import { estimateUseBy, shelfLifeDays } from './shelfLife'
import type { Product, Unit } from './types'

const NOW = new Date(2026, 9, 18, 12)
let seq = 0
const id = () => `u${++seq}`

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    household_id: 'h1',
    barcode: '123',
    name: 'Flour',
    brand: null,
    package_size: null,
    image_url: null,
    category: 'baking',
    default_location: 'pantry',
    tracking: 'level',
    source: 'manual',
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    deleted_at: null,
    ...over,
  }
}

/** Apply returned changes to a unit list, like the database would. */
function apply(units: Unit[], changes: Unit[]): Unit[] {
  const byId = new Map(units.map((u) => [u.id, u]))
  for (const c of changes) byId.set(c.id, c)
  return [...byId.values()].filter((u) => !u.deleted_at)
}

describe('shelf life', () => {
  it('uses specific foods, not just categories', () => {
    expect(shelfLifeDays('dairy', 'fridge', 'Whole Milk')).toBe(7)
    expect(shelfLifeDays('meat', 'fridge', 'Chicken Breasts')).toBe(2)
    expect(shelfLifeDays('meat', 'freezer', 'Chicken Breasts')).toBe(180)
    expect(shelfLifeDays('canned', 'pantry', 'Black Beans')).toBe(730)
  })

  it('does not let names override shelf-stable categories', () => {
    expect(shelfLifeDays('canned', 'pantry', 'Chicken Broth')).toBe(730)
    expect(shelfLifeDays('condiments', 'pantry', 'Peanut Butter')).toBe(365)
  })

  it('estimates a date from today', () => {
    expect(daysUntil(estimateUseBy('produce', 'fridge', 'Spinach', NOW), NOW)).toBe(5)
  })
})

describe('count items', () => {
  const beans = product({ name: 'Black Beans', category: 'canned', tracking: 'count' })

  it('adds and uses one at a time', () => {
    let units = addUnits(beans, 'pantry', 3, null, id, NOW)
    expect(summarize(units).total).toBe(3)
    units = apply(units, finishOne(units, NOW))
    expect(describeQuantity(beans, units)).toBe('2')
  })

  it('uses the one expiring first', () => {
    const units = [
      ...addUnits(beans, 'pantry', 1, '2027-06-01', id, NOW),
      ...addUnits(beans, 'pantry', 1, '2027-01-01', id, NOW),
    ]
    expect(nextUp(units)?.use_by).toBe('2027-01-01')
  })

  it('returns nothing to do when empty', () => {
    expect(finishOne([], NOW)).toEqual([])
  })
})

describe('level items', () => {
  const flour = product()

  it('used some → opens a package and sets the level', () => {
    let units = addUnits(flour, 'pantry', 2, null, id, NOW)
    units = apply(units, setLevelLeft(units, flour, 0.5, NOW))
    expect(describeQuantity(flour, units)).toBe('1 + ½ open')
    // Using more works on the same open package.
    units = apply(units, setLevelLeft(units, flour, 0.25, NOW))
    expect(describeQuantity(flour, units)).toBe('1 + ¼ open')
  })

  it('used it all → the open package is gone', () => {
    let units = addUnits(flour, 'pantry', 2, null, id, NOW)
    units = apply(units, setLevelLeft(units, flour, 0.5, NOW))
    units = apply(units, finishOne(units, NOW))
    expect(describeQuantity(flour, units)).toBe('1')
  })

  it('opened a new one → finishes the open one and opens a fresh one', () => {
    let units = addUnits(flour, 'pantry', 2, null, id, NOW)
    units = apply(units, setLevelLeft(units, flour, 0.25, NOW))
    units = apply(units, openNew(units, flour, NOW))
    expect(units).toHaveLength(1)
    expect(describeQuantity(flour, units)).toBe('Full open')
  })

  it('opening shortens the use-by for perishables', () => {
    const milk = product({ name: 'Whole Milk', category: 'dairy', default_location: 'fridge' })
    let units = addUnits(milk, 'fridge', 1, '2026-10-30', id, NOW)
    units = apply(units, setLevelLeft(units, milk, 0.75, NOW))
    expect(daysUntil(units[0].use_by!, NOW)).toBe(5)
  })
})

describe('moving', () => {
  it('extends shelf life in the freezer and shortens it when thawed', () => {
    const chicken = product({ name: 'Chicken Breasts', category: 'meat', tracking: 'count', default_location: 'fridge' })
    let units = addUnits(chicken, 'fridge', 1, null, id, NOW)
    expect(daysUntil(units[0].use_by!, NOW)).toBe(2)
    units = apply(units, moveUnits(units, chicken, 'freezer', NOW))
    expect(daysUntil(units[0].use_by!, NOW)).toBe(180)
    units = apply(units, moveUnits(units, chicken, 'fridge', NOW))
    expect(daysUntil(units[0].use_by!, NOW)).toBe(2)
  })

  it('keeps a printed date you entered when moving pantry ↔ fridge', () => {
    const bread = product({ name: 'Bread', category: 'bakery', tracking: 'count' })
    let units = addUnits(bread, 'pantry', 1, '2026-10-20', id, NOW)
    units = apply(units, moveUnits(units, bread, 'fridge', NOW))
    expect(units[0].use_by).toBe('2026-10-20')
  })
})
