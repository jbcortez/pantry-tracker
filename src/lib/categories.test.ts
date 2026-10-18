import { describe, expect, it } from 'vitest'
import { categorize, defaultLocation, defaultTracking, pathToTags, resolveCategories } from './categories'

describe('categorize', () => {
  it('prefers the most specific Open Food Facts tag', () => {
    const beans = ['en:plant-based-foods-and-beverages', 'en:plant-based-foods', 'en:legumes', 'en:canned-foods', 'en:canned-black-beans']
    expect(categorize(beans, 'Black Beans')).toBe('canned')
    const pb = ['en:plant-based-foods-and-beverages', 'en:spreads', 'en:nut-butters', 'en:peanut-butters']
    expect(categorize(pb, 'Creamy Peanut Butter')).toBe('condiments')
    expect(categorize(['en:dairies', 'en:milks', 'en:whole-milks'], 'Whole Milk')).toBe('dairy')
    const oj = ['en:plant-based-foods-and-beverages', 'en:beverages', 'en:fruit-based-beverages', 'en:juices-and-nectars', 'en:orange-juices']
    expect(categorize(oj, 'Orange Juice')).toBe('beverages')
  })

  it('files frozen vegetables under produce, but frozen meals under frozen', () => {
    expect(categorize(['en:plant-based-foods', 'en:frozen-foods', 'en:frozen-vegetables', 'en:frozen-peas'], 'Sweet Peas')).toBe('produce')
    expect(categorize(['en:frozen-foods', 'en:frozen-pizzas'], 'Pepperoni Pizza')).toBe('frozen')
  })

  it('ignores umbrella tags that say nothing', () => {
    expect(categorize(['en:plant-based-foods-and-beverages'], 'Mystery Item')).toBe('other')
  })

  it('falls back to name keywords', () => {
    expect(categorize([], 'All-Purpose Flour')).toBe('baking')
    expect(categorize([], 'Chicken Broth')).toBe('canned')
    expect(categorize([], 'Garlic Powder')).toBe('spices')
    expect(categorize([], 'Ground Black Pepper')).toBe('spices')
    expect(categorize([], 'Red Bell Pepper')).toBe('produce')
    expect(categorize([], 'Large Eggs')).toBe('dairy')
    expect(categorize([], 'Chicken Thighs')).toBe('meat')
    expect(categorize([], 'Spaghetti')).toBe('grains')
    expect(categorize([], 'Vanilla Ice Cream')).toBe('frozen')
  })

  it('reads UPCitemdb category paths', () => {
    const tags = pathToTags('Food, Beverages & Tobacco > Food Items > Condiments & Sauces > Ketchup')
    expect(tags).toEqual(['food-beverages-tobacco', 'food-items', 'condiments-sauces', 'ketchup'])
    expect(categorize(tags, 'Heinz Tomato Ketchup')).toBe('condiments')
  })
})

describe('defaults', () => {
  it('puts things where they usually live', () => {
    expect(defaultLocation('dairy', 'Milk')).toBe('fridge')
    expect(defaultLocation('produce', 'Yellow Onion')).toBe('pantry')
    expect(defaultLocation('produce', 'Spinach')).toBe('fridge')
    expect(defaultLocation('produce', 'Peas', ['en:frozen-vegetables'])).toBe('freezer')
    expect(defaultLocation('canned', 'Black Beans')).toBe('pantry')
  })

  it('tracks bit-at-a-time foods by level', () => {
    expect(defaultTracking('baking', 'Flour')).toBe('level')
    expect(defaultTracking('canned', 'Black Beans')).toBe('count')
    expect(defaultTracking('dairy', 'Eggs')).toBe('level')
    expect(defaultTracking('beverages', 'Orange Juice')).toBe('level')
    expect(defaultTracking('beverages', 'Seltzer')).toBe('count')
  })
})

describe('resolveCategories', () => {
  it('applies renames and keeps Other last', () => {
    const cats = resolveCategories([
      { id: 'produce', label: 'Veggies & Fruit', icon: '🥦' },
      { id: 'custom-baby', label: 'Baby Food', icon: '🍼' },
    ])
    expect(cats[0].label).toBe('Veggies & Fruit')
    expect(cats.at(-2)?.id).toBe('custom-baby')
    expect(cats.at(-1)?.id).toBe('other')
  })
})
