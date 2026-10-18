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
}

/** Fields of a product before it is saved. */
export type ProductDraft = Pick<
  Product,
  'barcode' | 'name' | 'brand' | 'package_size' | 'image_url' | 'category' | 'default_location' | 'tracking' | 'source'
>
