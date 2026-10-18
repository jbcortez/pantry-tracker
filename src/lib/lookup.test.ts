import { describe, expect, it } from 'vitest'
import { draftFromOFF, draftFromUPCitemdb, normalizeBarcode } from './lookup'

describe('normalizeBarcode', () => {
  it('stores UPC-A as 12 digits however it was read', () => {
    expect(normalizeBarcode('0041331124027')).toBe('041331124027')
    expect(normalizeBarcode('041331124027')).toBe('041331124027')
    expect(normalizeBarcode('5000159484695')).toBe('5000159484695')
  })
})

describe('Open Food Facts mapping', () => {
  it('builds a draft with category, location and tracking', () => {
    const draft = draftFromOFF('041331124027', {
      status: 1,
      product: {
        product_name: 'Black Beans',
        brands: 'Goya, Goya Foods',
        quantity: '15.5 oz',
        image_front_small_url: 'https://images.openfoodfacts.org/x.jpg',
        categories_tags: ['en:plant-based-foods-and-beverages', 'en:canned-foods', 'en:canned-black-beans'],
      },
    })
    expect(draft).toMatchObject({
      barcode: '041331124027',
      name: 'Black Beans',
      brand: 'Goya',
      package_size: '15.5 oz',
      category: 'canned',
      default_location: 'pantry',
      tracking: 'count',
      source: 'off',
    })
  })

  it('treats "not found" and nameless products as misses', () => {
    expect(draftFromOFF('1', { status: 0 })).toBeNull()
    expect(draftFromOFF('1', { status: 1, product: { product_name: '' } })).toBeNull()
    expect(draftFromOFF('1', null)).toBeNull()
  })
})

describe('UPCitemdb mapping', () => {
  it('builds a draft from the first item', () => {
    const draft = draftFromUPCitemdb('078742040233', {
      items: [
        {
          title: 'Great Value Whole Vitamin D Milk, 1 gal',
          brand: 'Great Value',
          category: 'Food, Beverages & Tobacco > Food Items > Dairy Products > Milk',
          images: ['https://example.com/milk.jpg'],
        },
      ],
    })
    expect(draft).toMatchObject({ brand: 'Great Value', category: 'dairy', default_location: 'fridge', tracking: 'level', source: 'upcitemdb' })
  })

  it('returns null with no items', () => {
    expect(draftFromUPCitemdb('1', { items: [] })).toBeNull()
  })
})
