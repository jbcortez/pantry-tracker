import { isLive } from './inventory.js'
import { isLow } from './shopping.js'
import type { Product, RecipeDraft, RecipeIngredient, Unit } from './types.js'

// ───────────── Matching ingredients to the kitchen ─────────────

const FILLER = new Set(
  'fresh large small medium chopped diced minced sliced grated shredded crushed can cans canned jar of the a an dried whole boneless skinless organic raw cooked to taste and or plus more for serving optional about cup cups tbsp tsp tablespoon tablespoons teaspoon teaspoons lb lbs oz ounce ounces pound pounds clove cloves bunch pinch piece pieces handful finely roughly thinly'.split(
    ' ',
  ),
)

/** Words that turn a food into a different product: "garlic" ≠ "garlic powder", "butter" ≠ "peanut butter". */
const TRANSFORMS = new Set(
  'powder sauce broth stock juice paste peanut almond cashew chip chips flake flakes extract syrup jam jelly milk seasoning soup dressing vinegar oil'.split(' '),
)

function singular(w: string): string {
  if (/(oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2)
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .map(singular)
}

/** How well a product name fits an ingredient name, 0 = not at all. */
export function matchScore(ingredient: string, product: string): number {
  const ing = tokens(ingredient)
  const prod = tokens(product)
  if (!ing.length || !prod.length) return 0
  const head = ing[ing.length - 1]
  if (!prod.includes(head)) return 0
  if (prod.some((w) => TRANSFORMS.has(w) && !ing.includes(w))) return 0
  const shared = ing.filter((w) => prod.includes(w)).length
  // Prefer exact-ish names: penalize extra words on either side a little.
  return shared / ing.length - 0.05 * (prod.length - shared)
}

export function findProduct(ingredient: string, products: Product[], hasUnits?: (p: Product) => boolean): Product | undefined {
  let best: Product | undefined
  let bestScore = 0.49
  for (const p of products) {
    const score = matchScore(ingredient, p.name) + (hasUnits?.(p) ? 0.01 : 0)
    if (score > bestScore) {
      best = p
      bestScore = score
    }
  }
  return best
}

export type IngredientState = 'have' | 'low' | 'missing' | 'staple'

export interface MatchedIngredient {
  ingredient: RecipeIngredient
  state: IngredientState
  product?: Product
}

export interface KitchenLike {
  products: Product[]
  productsById: Map<string, Product>
  unitsByProduct: Map<string, Unit[]>
}

/** What you have for a recipe, right now. */
export function matchRecipe(recipe: RecipeDraft, kitchen: KitchenLike): MatchedIngredient[] {
  const units = (p: Product) => (kitchen.unitsByProduct.get(p.id) ?? []).filter(isLive)
  return recipe.ingredients.map((ingredient) => {
    if (ingredient.staple) return { ingredient, state: 'staple' }
    let product = ingredient.product_id ? kitchen.productsById.get(ingredient.product_id) : undefined
    if (!product || !units(product).length) {
      product = findProduct(ingredient.name, kitchen.products, (p) => units(p).length > 0) ?? product
    }
    if (!product || !units(product).length) return { ingredient, state: 'missing', product }
    return { ingredient, state: isLow(units(product)) ? 'low' : 'have', product }
  })
}

export function missing(matched: MatchedIngredient[]): MatchedIngredient[] {
  return matched.filter((m) => m.state === 'missing')
}

/** "2 cups spinach", but "salt, to taste". */
export function ingredientLine(ing: RecipeIngredient): { lead: string; rest: string } {
  const amount = ing.amount.trim()
  if (!amount) return { lead: '', rest: ing.name }
  return /^[\d½¼¾⅓⅔⅛]/.test(amount) ? { lead: amount, rest: ing.name } : { lead: '', rest: `${ing.name}, ${amount}` }
}
