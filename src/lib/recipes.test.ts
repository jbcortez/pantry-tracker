import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addMissingToList, consume, createProduct } from './actions'
import { db } from './db'
import { isLive } from './inventory'
import { makeDraft } from './lookup'
import { findProduct, ingredientLine, matchRecipe, matchScore, missing, type KitchenLike } from './recipes'
import type { Product, RecipeDraft } from './types'

const HID = 'h1'

describe('matchScore', () => {
  it('matches the same food despite wording', () => {
    expect(matchScore('black beans', 'Black Beans')).toBeGreaterThan(0.9)
    expect(matchScore('yellow onion, diced', 'Onion')).toBeGreaterThan(0.4)
    expect(matchScore('2 large eggs', 'Large Eggs')).toBeGreaterThan(0.9)
    expect(matchScore('olive oil', 'Extra Virgin Olive Oil')).toBeGreaterThan(0.5)
    expect(matchScore('tomatoes', 'Tomato')).toBeGreaterThan(0.9)
    expect(matchScore('milk', 'Whole Milk')).toBeGreaterThan(0.5)
  })

  it('does not confuse a food with a product made from it', () => {
    expect(matchScore('butter', 'Peanut Butter')).toBe(0)
    expect(matchScore('garlic', 'Garlic Powder')).toBe(0)
    expect(matchScore('chicken', 'Chicken Broth')).toBe(0)
    expect(matchScore('tomato', 'Tomato Sauce')).toBe(0)
    expect(matchScore('lemon', 'Lemon Juice')).toBe(0)
    expect(matchScore('rice', 'Black Beans')).toBe(0)
  })

  it('picks the closest product', () => {
    const products = [{ name: 'Chicken Thighs' }, { name: 'Chicken Breasts' }] as Product[]
    expect(findProduct('boneless chicken breast', products)?.name).toBe('Chicken Breasts')
  })
})

async function kitchen(): Promise<KitchenLike> {
  const products = (await db.products.toArray()).filter((p) => !p.deleted_at)
  const units = (await db.inventory_units.toArray()).filter(isLive)
  const unitsByProduct = new Map<string, typeof units>()
  for (const u of units) unitsByProduct.set(u.product_id, [...(unitsByProduct.get(u.product_id) ?? []), u])
  return { products, productsById: new Map(products.map((p) => [p.id, p])), unitsByProduct }
}

describe('matchRecipe', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('sorts ingredients into have / missing / basics, by id or by name', async () => {
    const { product: beans } = await createProduct(HID, makeDraft({ barcode: '1', name: 'Black Beans' }, [], 'off'), {
      location: 'pantry',
      count: 1,
      useBy: null,
    })
    await createProduct(HID, makeDraft({ barcode: null, name: 'Onion' }, [], 'quick'), { location: 'pantry', count: 2, useBy: null })
    const recipe: RecipeDraft = {
      title: 'Beans and rice',
      summary: '',
      time_minutes: 30,
      servings: 2,
      steps: [],
      ingredients: [
        { name: 'black beans', amount: '1 can', product_id: beans.id, staple: false },
        { name: 'yellow onion', amount: '1', product_id: null, staple: false },
        { name: 'rice', amount: '1 cup', product_id: null, staple: false },
        { name: 'salt', amount: 'pinch', product_id: null, staple: true },
      ],
    }
    let m = matchRecipe(recipe, await kitchen())
    expect(m.map((x) => x.state)).toEqual(['have', 'have', 'missing', 'staple'])

    // Use the beans up: now two things are missing, and the beans link to the known product.
    await consume(beans, { kind: 'one' })
    m = matchRecipe(recipe, await kitchen())
    expect(missing(m).map((x) => x.ingredient.name)).toEqual(['black beans', 'rice'])
    expect(m[0].product?.id).toBe(beans.id)

    const r = await addMissingToList(HID, recipe.title, missing(m))
    expect(r.count).toBe(2)
    const list = await db.shopping_items.toArray()
    expect(list.find((i) => i.name === 'Black Beans')?.product_id).toBe(beans.id)
    expect(list.find((i) => i.name === 'rice')?.category).toBe('grains')
    expect(list.every((i) => i.source === 'recipe' && i.note === 'For Beans and rice')).toBe(true)
    // Already there: no duplicates.
    expect((await addMissingToList(HID, recipe.title, missing(m))).count).toBe(0)
  })
})

describe('ingredientLine', () => {
  it('puts numeric amounts first and others after', () => {
    expect(ingredientLine({ name: 'spinach', amount: '2 cups', product_id: null, staple: false })).toEqual({ lead: '2 cups', rest: 'spinach' })
    expect(ingredientLine({ name: 'salt', amount: 'to taste', product_id: null, staple: true })).toEqual({ lead: '', rest: 'salt, to taste' })
  })
})
