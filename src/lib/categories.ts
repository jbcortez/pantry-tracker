import type { CategoryDef, Location, Tracking } from './types.js'

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: 'produce', label: 'Produce', icon: '🥕' },
  { id: 'meat', label: 'Meat & Seafood', icon: '🥩' },
  { id: 'dairy', label: 'Dairy & Eggs', icon: '🥛' },
  { id: 'bakery', label: 'Bread & Bakery', icon: '🍞' },
  { id: 'deli', label: 'Deli & Leftovers', icon: '🥪' },
  { id: 'canned', label: 'Canned & Jarred', icon: '🥫' },
  { id: 'grains', label: 'Pasta, Rice & Grains', icon: '🍝' },
  { id: 'baking', label: 'Baking', icon: '🧁' },
  { id: 'spices', label: 'Spices & Seasonings', icon: '🧂' },
  { id: 'condiments', label: 'Oils, Sauces & Condiments', icon: '🫙' },
  { id: 'breakfast', label: 'Breakfast & Cereal', icon: '🥣' },
  { id: 'snacks', label: 'Snacks', icon: '🍿' },
  { id: 'frozen', label: 'Frozen Meals & Desserts', icon: '🍦' },
  { id: 'beverages', label: 'Beverages', icon: '🧃' },
  { id: 'other', label: 'Other', icon: '📦' },
]

/** The household's category list: defaults, with household renames and additions applied. */
export function resolveCategories(overrides: CategoryDef[] | null | undefined): CategoryDef[] {
  if (!overrides?.length) return DEFAULT_CATEGORIES
  const byId = new Map(overrides.map((c) => [c.id, c]))
  const merged = DEFAULT_CATEGORIES.map((c) => byId.get(c.id) ?? c)
  const extras = overrides.filter((c) => !DEFAULT_CATEGORIES.some((d) => d.id === c.id))
  // Keep "Other" last.
  return [...merged.filter((c) => c.id !== 'other'), ...extras, merged.find((c) => c.id === 'other')!]
}

/**
 * Category tag (Open Food Facts "en:canned-beans", or a slugged UPCitemdb path segment)
 * → our category. Within one tag, earlier rules win, so the form (canned, frozen meal)
 * beats what the food is (vegetables).
 */
const TAG_RULES: [string, RegExp][] = [
  ['frozen', /frozen-(meals|pizzas|desserts|dishes|ready-meals|snacks|entrees)|ice-creams?|sorbets/],
  ['canned', /canned|tinned|jarred|pickle|en:soups|broths|pasta-sauces|tomato-sauces|salsas/],
  ['beverages', /beverages|drinks|waters|juices|sodas|coffees|en:teas|nectars|kombucha/],
  ['spices', /spices|seasoning|en:salts|dried-herbs|peppercorns|extracts/],
  ['condiments', /condiments|sauces|en:oils|olive-oils|vegetable-oils|vinegars|dressings|mayonnaise|ketchup|mustards|honeys|syrups|jams|spreads|peanut-butters|nut-butters/],
  ['baking', /baking|flours|en:sugars|yeasts|cake-mixes|chocolate-chips|sweeteners|cocoa/],
  ['breakfast', /breakfast|oat-flakes|oatmeals|porridge|granola|mueslis|pancake/],
  ['snacks', /snacks|chips|crisps|crackers|cookies|biscuits|candies|confectioner|chocolates|popcorn|pretzels/],
  ['bakery', /breads|bakery|tortillas|bagels|buns|pastries|viennoiseries|muffins/],
  ['grains', /pastas|noodles|rices|en:grains|quinoa|couscous|dried-legumes|lentils/],
  ['deli', /deli|prepared-meals|ready-meals|en:hams|salami|cold-cuts|hummus|dips/],
  ['dairy', /dairies|dairy|milks|cheeses|yogurts|en:butters|en:eggs|creams/],
  ['meat', /meats|poultry|chicken|beef|pork|fishes|seafood|sausages|bacon|turkey/],
  ['produce', /vegetables|fruits|salads|fresh-herbs|berries|bananas|apples|potatoes|onions/],
]

/** Tags so broad they say nothing about the aisle. */
const UMBRELLA_TAGS = /plant-based-foods|^en:foods$|-based-foods$|beverages-tobacco|^food-items?$|^food$/

/** Product-name keywords for when tags are missing or unhelpful. Same ordering rules. */
const NAME_RULES: [string, RegExp][] = [
  ['frozen', /ice cream|popsicle|frozen (pizza|meal|dinner|entree|waffles)|pizza rolls/],
  ['canned', /\bcanned\b|\bsoup\b|\bbroth\b|\bstock\b|pasta sauce|marinara|salsa|pickles?\b|\bbeans\b|\btuna\b/],
  ['beverages', /\bsoda\b|\bjuice\b|\bwater\b|seltzer|\bcoffee\b|\btea\b|lemonade|kombucha|\bcola\b|\bbeer\b|\bwine\b/],
  ['spices', /\bspice|seasoning|\bsalt\b|peppercorn|black pepper|ground pepper|paprika|cumin|oregano|cinnamon|chili powder|garlic powder|onion powder|vanilla extract|bay leaves/],
  ['condiments', /\boil\b|vinegar|ketchup|mustard|mayo|dressing|\bsauce\b|sriracha|honey|syrup|\bjam\b|jelly|peanut butter|almond butter|\bpreserves\b/],
  ['baking', /\bflour\b|\bsugar\b|baking (soda|powder)|\byeast\b|cake mix|chocolate chips|cornstarch|cocoa/],
  ['breakfast', /cereal|oatmeal|\boats\b|granola|muesli|pancake|waffle mix|pop.?tarts/],
  ['snacks', /\bchips\b|crackers|cookies|pretzels|popcorn|\bcandy\b|chocolate bar|granola bar|\bnuts\b|trail mix|jerky/],
  ['bakery', /\bbread\b|tortilla|bagel|\bbuns?\b|english muffin|pita|croissant|naan/],
  ['grains', /pasta|spaghetti|penne|macaroni|noodles|\brice\b|quinoa|couscous|lentils|barley|farro/],
  ['deli', /leftover|hummus|\bham\b|salami|deli|rotisserie|prepared/],
  ['dairy', /\bmilk\b|cheese|yogurt|yoghurt|\bbutter\b|\beggs?\b|\bcream\b|cottage|half (and|&) half/],
  ['meat', /chicken|\bbeef\b|\bpork\b|\bsteak\b|\bturkey\b|sausage|bacon|salmon|shrimp|\bfish\b|lamb/],
  ['produce', /lettuce|spinach|kale|onion|garlic|potato|tomato|carrot|celery|pepper|cucumber|broccoli|avocado|banana|apple|orange|lemon|lime|berr(y|ies)|grape|cilantro|parsley|basil|mushroom|zucchini|ginger|scallion|\bpeas\b|\bcorn\b/],
]

/** `tags` are ordered general → specific, as Open Food Facts returns them. */
export function categorize(tags: string[], name: string): string {
  const specificFirst = tags
    .map((t) => t.toLowerCase())
    .filter((t) => !UMBRELLA_TAGS.test(t))
    .reverse()
  for (const tag of specificFirst) {
    for (const [cat, re] of TAG_RULES) {
      if (re.test(tag)) return cat
    }
  }
  const n = name.toLowerCase()
  for (const [cat, re] of NAME_RULES) {
    if (re.test(n)) return cat
  }
  return 'other'
}

/** "Food, Beverages & Tobacco > Food Items > Condiments & Sauces" → slugged tags. */
export function pathToTags(path: string | null | undefined): string[] {
  if (!path) return []
  return path
    .split('>')
    .map((s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
}

const CATEGORY_LOCATION: Record<string, Location> = {
  produce: 'fridge',
  meat: 'fridge',
  dairy: 'fridge',
  deli: 'fridge',
  frozen: 'freezer',
}

/** Produce that keeps on the counter or in the pantry rather than the fridge. */
const PANTRY_PRODUCE = /onion|garlic|potato|banana|avocado|tomato|sweet potato|squash|ginger/

export function defaultLocation(category: string, name: string, tags: string[] = []): Location {
  if (/\bfrozen\b/i.test(name) || tags.some((t) => /frozen/.test(t))) return 'freezer'
  if (category === 'produce' && PANTRY_PRODUCE.test(name.toLowerCase())) return 'pantry'
  return CATEGORY_LOCATION[category] ?? 'pantry'
}

/** Things used up a bit at a time default to "level"; discrete things to "count". */
const LEVEL_CATEGORIES = new Set(['dairy', 'grains', 'baking', 'spices', 'condiments', 'breakfast', 'snacks'])

export function defaultTracking(category: string, name: string): Tracking {
  const n = name.toLowerCase()
  if (category === 'dairy' && /\beggs?\b/.test(n)) return 'level'
  if (/\bmilk\b|\bjuice\b/.test(n)) return 'level'
  return LEVEL_CATEGORIES.has(category) ? 'level' : 'count'
}
