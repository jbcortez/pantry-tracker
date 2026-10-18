import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addProductToList, consume, createProduct, listLowStaples, putAway, setStaple } from './actions'
import { db } from './db'
import { addUnits } from './inventory'
import { makeDraft } from './lookup'
import { isLow } from './shopping'
import type { Product } from './types'

const HID = 'h1'
const openList = () => db.shopping_items.filter((i) => !i.deleted_at && !i.checked_at).toArray()

async function make(name: string, tags: string[], count: number): Promise<Product> {
  const { product } = await createProduct(HID, makeDraft({ barcode: name, name }, tags, 'off'), {
    location: 'pantry',
    count,
    useBy: null,
  })
  return product
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('isLow', () => {
  it('is low when out, or when the last package is down to ¼', async () => {
    const p = await make('Flour', ['en:flours'], 0)
    let n = 0
    const id = () => `x${++n}`
    expect(isLow([])).toBe(true)
    const [u] = addUnits(p, 'pantry', 1, null, id)
    expect(isLow([u])).toBe(false)
    expect(isLow([{ ...u, opened_at: 'x', level: 0.25 }])).toBe(true)
    const [spare] = addUnits(p, 'pantry', 1, null, id)
    expect(isLow([{ ...u, opened_at: 'x', level: 0.25 }, spare])).toBe(false)
  })
})

describe('staples', () => {
  it('a staple that runs out lists itself, and undo takes it back off', async () => {
    const beans = await make('Black Beans', ['en:canned-black-beans'], 1)
    await setStaple(beans, true)
    const staple = (await db.products.get(beans.id))!

    const r = await consume(staple, { kind: 'one' })
    expect(r.listed).toBe(true)
    expect((await openList()).map((i) => i.name)).toEqual(['Black Beans'])

    await r.undo()
    expect(await openList()).toEqual([])
  })

  it('a staple down to its last quarter lists itself', async () => {
    const flour = await make('Flour', ['en:flours'], 1)
    await setStaple(flour, true)
    const staple = (await db.products.get(flour.id))!
    expect((await consume(staple, { kind: 'left', level: 0.5 })).listed).toBe(false)
    expect((await consume(staple, { kind: 'left', level: 0.25 })).listed).toBe(true)
    // Already listed: no duplicate.
    expect((await consume(staple, { kind: 'one' })).listed).toBe(false)
    expect(await openList()).toHaveLength(1)
  })

  it('marking something a staple while it is low lists it right away', async () => {
    const oil = await make('Olive Oil', ['en:olive-oils'], 0)
    expect((await setStaple(oil, true)).listed).toBe(true)
  })

  it('"add low staples" catches anything missed', async () => {
    const a = await make('Rice', ['en:rices'], 0)
    const b = await make('Pasta', ['en:pastas'], 2)
    await db.products.bulkPut([{ ...a, staple: true }, { ...b, staple: true }])
    expect((await listLowStaples(HID)).count).toBe(1)
    expect((await listLowStaples(HID)).count).toBe(0)
  })
})

describe('ran out', () => {
  it('offers to list a non-staple when it runs out', async () => {
    const salsa = await make('Salsa', ['en:salsas'], 1)
    const r = await consume(salsa, { kind: 'one' })
    expect(r.ranOut).toBe(true)
    expect(r.listed).toBe(false)
    expect(await addProductToList(salsa, 'ran_out')).not.toBeNull()
    // Second add is a no-op.
    expect(await addProductToList(salsa, 'ran_out')).toBeNull()
  })
})

describe('putting away', () => {
  it('ticks the item off the list without double counting', async () => {
    const milk = await make('Whole Milk', ['en:milks'], 0)
    await addProductToList(milk)
    const r = await putAway(milk)
    expect(r.remaining).toBe(1)
    expect(await openList()).toEqual([])
    const checked = await db.shopping_items.toArray()
    expect(checked[0].checked_at).not.toBeNull()
  })
})
