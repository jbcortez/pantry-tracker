import { addDays, minDate } from './dates'
import type { Location } from './types'

type Days = Record<Location, number>

/** Typical unopened shelf life by category and location, in days. Deliberately conservative. */
const CATEGORY_DAYS: Record<string, Days> = {
  produce: { pantry: 7, fridge: 7, freezer: 240 },
  meat: { pantry: 1, fridge: 2, freezer: 180 },
  dairy: { pantry: 2, fridge: 10, freezer: 90 },
  bakery: { pantry: 5, fridge: 10, freezer: 90 },
  deli: { pantry: 1, fridge: 5, freezer: 60 },
  canned: { pantry: 730, fridge: 730, freezer: 730 },
  grains: { pantry: 365, fridge: 365, freezer: 365 },
  baking: { pantry: 365, fridge: 365, freezer: 365 },
  spices: { pantry: 730, fridge: 730, freezer: 730 },
  condiments: { pantry: 365, fridge: 365, freezer: 365 },
  breakfast: { pantry: 180, fridge: 180, freezer: 180 },
  snacks: { pantry: 90, fridge: 90, freezer: 180 },
  frozen: { pantry: 1, fridge: 2, freezer: 180 },
  beverages: { pantry: 270, fridge: 30, freezer: 180 },
  other: { pantry: 30, fridge: 7, freezer: 90 },
}

/** Days usable after opening, by category. Missing = opening doesn't matter. */
const OPENED_DAYS: Record<string, number> = {
  dairy: 7,
  canned: 5,
  condiments: 90,
  deli: 5,
  beverages: 7,
  snacks: 14,
  breakfast: 60,
  meat: 2,
  bakery: 7,
}

/** Name overrides only apply here, so "chicken broth" or "peanut butter" keep their category's shelf life. */
const PERISHABLE = new Set(['produce', 'meat', 'dairy', 'bakery', 'deli', 'beverages', 'other'])

function nameHit(category: string, name: string) {
  if (!PERISHABLE.has(category)) return undefined
  const n = name.toLowerCase()
  return NAME_DAYS.find(([re]) => re.test(n))
}

/** Specific foods that differ from their category. Applies outside the freezer only. */
const NAME_DAYS: [RegExp, number, number?][] = [
  // [pattern, unopened days, opened days]
  [/\bmilk\b|half (and|&) half|\bcream\b/, 7, 5],
  [/\beggs?\b/, 35, 35],
  [/yogurt|yoghurt|sour cream|cottage/, 14, 7],
  [/shredded cheese|grated cheese/, 21, 7],
  [/cheese/, 30, 21],
  [/\bbutter\b/, 60, 30],
  [/ground (beef|turkey|pork|chicken)|chicken|\bfish\b|salmon|shrimp|seafood/, 2, 2],
  [/steak|\bbeef\b|\bpork\b|lamb/, 4, 4],
  [/bacon|hot dogs?|sausage/, 7, 7],
  [/lettuce|salad|spinach|arugula|greens|kale/, 5],
  [/berr(y|ies)|strawberr/, 4],
  [/banana|avocado/, 5],
  [/cilantro|parsley|basil|mint|dill|scallion|green onion/, 6],
  [/tomato/, 6],
  [/mushroom/, 6],
  [/apple|carrot/, 28],
  [/lemon|lime|orange|grapefruit/, 21],
  [/onion|garlic|potato|squash/, 30],
  [/celery|bell pepper|cucumber|zucchini|broccoli|cauliflower/, 10],
  [/\bbread\b|bagel|\bbuns?\b/, 6],
  [/tortilla/, 14],
  [/leftover/, 4],
  [/hummus/, 7],
  [/\bjuice\b/, 10, 7],
]

export function shelfLifeDays(category: string, location: Location, name = ''): number {
  if (location !== 'freezer') {
    const hit = nameHit(category, name)
    // Shelf-stable juice and dairy keep their category value in the pantry.
    if (hit && !(category === 'beverages' && location === 'pantry')) return hit[1]
  }
  return (CATEGORY_DAYS[category] ?? CATEGORY_DAYS.other)[location]
}

function openedDays(category: string, name: string): number | null {
  const hit = nameHit(category, name)
  if (hit?.[2] != null) return hit[2]
  return OPENED_DAYS[category] ?? null
}

/** Estimated use-by date for something put in `location` today. */
export function estimateUseBy(category: string, location: Location, name = '', now = new Date()): string {
  return addDays(now, shelfLifeDays(category, location, name))
}

/** Use-by after opening: the sooner of the printed estimate and the opened-shelf-life window. */
export function useByAfterOpening(
  current: string | null,
  category: string,
  location: Location,
  name = '',
  now = new Date(),
): string | null {
  if (location === 'freezer') return current
  const days = openedDays(category, name)
  if (days == null) return current
  return minDate(current, addDays(now, days))
}
