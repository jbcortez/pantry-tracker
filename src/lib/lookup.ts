import { categorize, defaultLocation, defaultTracking, pathToTags } from './categories'
import { db } from './db'
import type { Product, ProductDraft, ProductSource } from './types'

export type LookupResult =
  | { kind: 'known'; product: Product }
  | { kind: 'found'; draft: ProductDraft }
  | { kind: 'unknown'; draft: ProductDraft; offline: boolean }

/** Scanners report UPC-A both as 12 digits and as 13 with a leading 0; store one form. */
export function normalizeBarcode(code: string): string {
  const digits = code.trim()
  return /^0\d{12}$/.test(digits) ? digits.slice(1) : digits
}

export async function findKnownProduct(householdId: string, barcode: string): Promise<Product | undefined> {
  const matches = await db.products.where('barcode').equals(barcode).toArray()
  return matches
    .filter((p) => p.household_id === householdId && !p.deleted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
}

export function makeDraft(
  fields: { barcode: string | null; name: string; brand?: string | null; package_size?: string | null; image_url?: string | null },
  tags: string[],
  source: ProductSource,
): ProductDraft {
  const category = categorize(tags, fields.name)
  return {
    barcode: fields.barcode,
    name: fields.name,
    brand: fields.brand || null,
    package_size: fields.package_size || null,
    image_url: fields.image_url || null,
    category,
    default_location: defaultLocation(category, fields.name, tags),
    tracking: defaultTracking(category, fields.name),
    source,
  }
}

async function fetchJSON(url: string, timeoutMs = 6000): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface OFFResponse {
  status: number
  product?: {
    product_name?: string
    product_name_en?: string
    generic_name?: string
    brands?: string
    quantity?: string
    image_front_small_url?: string
    categories_tags?: string[]
  }
}

const OFF_FIELDS = 'product_name,product_name_en,generic_name,brands,quantity,image_front_small_url,categories_tags'

export function draftFromOFF(barcode: string, body: unknown): ProductDraft | null {
  const r = body as OFFResponse | null
  const p = r?.status === 1 ? r.product : undefined
  const name = (p?.product_name_en || p?.product_name || p?.generic_name || '').trim()
  if (!p || !name) return null
  return makeDraft(
    {
      barcode,
      name,
      brand: p.brands?.split(',')[0]?.trim(),
      package_size: p.quantity,
      image_url: p.image_front_small_url,
    },
    p.categories_tags ?? [],
    'off',
  )
}

async function openFoodFacts(barcode: string): Promise<ProductDraft | null> {
  // Open Food Facts usually stores UPC-A as 13 digits; try both forms.
  const forms = barcode.length === 12 ? [barcode, `0${barcode}`] : [barcode]
  for (const code of forms) {
    const body = await fetchJSON(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`)
    const draft = draftFromOFF(barcode, body)
    if (draft) return draft
  }
  return null
}

interface UPCResponse {
  items?: { title?: string; brand?: string; size?: string; category?: string; images?: string[] }[]
}

export function draftFromUPCitemdb(barcode: string, body: unknown): ProductDraft | null {
  const item = (body as UPCResponse | null)?.items?.[0]
  const name = item?.title?.trim()
  if (!item || !name) return null
  return makeDraft(
    { barcode, name, brand: item.brand, package_size: item.size, image_url: item.images?.[0] },
    pathToTags(item.category),
    'upcitemdb',
  )
}

async function upcItemDb(barcode: string): Promise<ProductDraft | null> {
  // Proxied through our own server function (api/upc.ts) — UPCitemdb blocks browser calls.
  return draftFromUPCitemdb(barcode, await fetchJSON(`/api/upc?upc=${encodeURIComponent(barcode)}`))
}

/** Household memory → Open Food Facts → UPCitemdb → blank form. */
export async function lookupBarcode(householdId: string, rawCode: string): Promise<LookupResult> {
  const barcode = normalizeBarcode(rawCode)
  const known = await findKnownProduct(householdId, barcode)
  if (known) return { kind: 'known', product: known }

  const offline = !navigator.onLine
  if (!offline) {
    const draft = (await openFoodFacts(barcode)) ?? (await upcItemDb(barcode))
    if (draft) return { kind: 'found', draft }
  }
  return { kind: 'unknown', offline, draft: makeDraft({ barcode, name: '' }, [], 'manual') }
}
