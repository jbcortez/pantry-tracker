export type Location = 'pantry' | 'fridge' | 'freezer'
export type Tracking = 'count' | 'level'
export type ProductSource = 'off' | 'upcitemdb' | 'manual' | 'quick'

export const LOCATIONS: { id: Location; label: string; icon: string }[] = [
  { id: 'pantry', label: 'Pantry', icon: '🗄️' },
  { id: 'fridge', label: 'Fridge', icon: '❄️' },
  { id: 'freezer', label: 'Freezer', icon: '🧊' },
]

/** A kind of thing you buy. Doubles as the household's barcode memory. */
export interface Product {
  id: string
  household_id: string
  barcode: string | null
  name: string
  brand: string | null
  package_size: string | null
  image_url: string | null
  category: string
  default_location: Location
  tracking: Tracking
  source: ProductSource
  /** "Always keep stocked": goes on the shopping list automatically when low. */
  staple?: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** One physical package on a shelf. */
export interface Unit {
  id: string
  household_id: string
  product_id: string
  location: Location
  /** 1 = full. Only meaningful once opened. */
  level: number
  opened_at: string | null
  /** YYYY-MM-DD */
  use_by: string | null
  added_at: string
  updated_at: string
  deleted_at: string | null
}

export type ShoppingSource = 'manual' | 'staple' | 'ran_out' | 'recipe'

export interface ShoppingItem {
  id: string
  household_id: string
  /** Linked when the item is something the household has had before. */
  product_id: string | null
  name: string
  category: string
  note: string | null
  source: ShoppingSource
  checked_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface RecipeIngredient {
  name: string
  amount: string
  /** The inventory product this uses, when known. Matching also falls back to the name. */
  product_id: string | null
  /** Salt, pepper, water: assumed on hand. */
  staple: boolean
}

/** A recipe as written, before it's saved to the household's recipe box. */
export interface RecipeDraft {
  title: string
  summary: string
  time_minutes: number | null
  servings: number | null
  ingredients: RecipeIngredient[]
  steps: string[]
}

export interface Recipe extends RecipeDraft {
  id: string
  household_id: string
  source: 'ai' | 'url' | 'manual'
  source_url: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CategoryDef {
  id: string
  label: string
  icon: string
}

export interface Household {
  id: string
  name: string
  invite_code: string
  /** Household overrides of the default category list; empty means defaults. */
  categories: CategoryDef[]
  /** Dietary rules and dislikes, followed by recipe suggestions. */
  recipe_notes?: string
}

/** Fields of a product before it is saved. */
export type ProductDraft = Pick<
  Product,
  'barcode' | 'name' | 'brand' | 'package_size' | 'image_url' | 'category' | 'default_location' | 'tracking' | 'source'
>
