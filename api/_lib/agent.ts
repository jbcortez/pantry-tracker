import { createClient } from '@supabase/supabase-js'
import { categorize, resolveCategories } from '../../src/lib/categories.js'
import { daysUntil, urgency } from '../../src/lib/dates.js'
import { describeQuantity, summarize } from '../../src/lib/inventory.js'
import { findProduct, ingredientLine, matchRecipe, type KitchenLike } from '../../src/lib/recipes.js'
import { normalizeSupabaseUrl } from '../../src/lib/supabaseUrl.js'
import {
  LOCATIONS,
  type CategoryDef,
  type Location,
  type Product,
  type RecipeDraft,
  type ShoppingItem,
  type Unit,
} from '../../src/lib/types.js'

/**
 * What Claude can do with a household, shared by the MCP connector (api/mcp.ts) and the
 * CLI endpoint (api/agent.ts). Every call is authorized by a household key checked inside
 * the database (see agent_* functions in supabase/schema.sql). Files under api/_lib aren't routes.
 */

export class AgentError extends Error {}

export interface Snapshot {
  household: { name: string; recipe_notes: string; categories: CategoryDef[] }
  products: Product[]
  units: Unit[]
  shopping: ShoppingItem[]
  recipes: { id: string; title: string }[]
}

function db() {
  const url = normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL)
  const key = process.env.VITE_SUPABASE_KEY?.trim()
  if (!url || !key) throw new AgentError('Pantry sync isn’t set up on the server (see docs/SETUP.md).')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args)
  if (error) throw new AgentError(error.message)
  return data as T
}

export function keyFrom(request: Request): string | null {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  return bearer ?? new URL(request.url).searchParams.get('key')
}

/** The household name, or an AgentError for a bad key. */
export const checkKey = (key: string) => rpc<string>('agent_check', { p_key: key })

export const snapshot = (key: string) => rpc<Snapshot>('agent_snapshot', { p_key: key })

function kitchenOf(s: Snapshot): KitchenLike {
  const unitsByProduct = new Map<string, Unit[]>()
  for (const u of s.units) unitsByProduct.set(u.product_id, [...(unitsByProduct.get(u.product_id) ?? []), u])
  return { products: s.products, productsById: new Map(s.products.map((p) => [p.id, p])), unitsByProduct }
}

// ───────────── Reading ─────────────

function useByPhrase(isoDate: string): string {
  const n = daysUntil(isoDate)
  if (n < 0) return `expired ${-n} day${n === -1 ? '' : 's'} ago`
  if (n === 0) return 'use today'
  if (n === 1) return 'use tomorrow'
  if (n <= 14) return `use within ${n} days`
  const [y, m, d] = isoDate.split('-').map(Number)
  return `use by ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export function formatInventory(s: Snapshot, opts: { location?: Location } = {}): string {
  const categories = resolveCategories(s.household.categories)
  const kitchen = kitchenOf(s)
  const groups = s.products.flatMap((p) => {
    const byLoc = new Map<Location, Unit[]>()
    for (const u of kitchen.unitsByProduct.get(p.id) ?? []) byLoc.set(u.location, [...(byLoc.get(u.location) ?? []), u])
    return [...byLoc].map(([location, units]) => ({ p, location, units, next: summarize(units).nextUseBy }))
  })
  const shown = opts.location ? groups.filter((g) => g.location === opts.location) : groups
  const line = (g: (typeof groups)[number], withLocation = false) =>
    `- ${g.p.name}${g.p.brand ? ` (${g.p.brand})` : ''}: ${describeQuantity(g.p, g.units)}` +
    (withLocation ? `, ${g.location}` : '') +
    (g.next ? ` · ${useByPhrase(g.next)}` : '')

  const out = [`Kitchen: ${s.household.name}`]
  if (s.household.recipe_notes.trim()) out.push(`Household preferences (always follow): ${s.household.recipe_notes.trim()}`)
  if (!shown.length) {
    out.push('', opts.location ? `Nothing in the ${opts.location}.` : 'The kitchen is empty.')
    return out.join('\n')
  }

  const soon = shown
    .filter((g) => urgency(g.next) !== 'ok')
    .sort((a, b) => (a.next ?? '').localeCompare(b.next ?? ''))
  if (soon.length) out.push('', 'USE SOON (expired or due within 3 days):', ...soon.map((g) => line(g, true)))

  for (const loc of LOCATIONS) {
    const inLoc = shown.filter((g) => g.location === loc.id)
    if (!inLoc.length) continue
    out.push('', loc.label.toUpperCase())
    for (const cat of categories) {
      const inCat = inLoc
        .filter((g) => (categories.some((c) => c.id === g.p.category) ? g.p.category : 'other') === cat.id)
        .sort((a, b) => a.p.name.localeCompare(b.p.name))
      if (inCat.length) out.push(`${cat.label}:`, ...inCat.map((g) => line(g)))
    }
  }
  out.push('', 'Quantities: a number is whole packages; "½ open" is how full the open package is.')
  if (s.recipes.length) out.push(`Saved recipes: ${s.recipes.map((r) => r.title).join('; ')}`)
  return out.join('\n')
}

export function formatShoppingList(s: Snapshot): string {
  if (!s.shopping.length) return 'The shopping list is empty.'
  const categories = resolveCategories(s.household.categories)
  const out = ['Shopping list:']
  for (const cat of categories) {
    const items = s.shopping.filter((i) => (categories.some((c) => c.id === i.category) ? i.category : 'other') === cat.id)
    if (items.length) out.push(`${cat.label}:`, ...items.map((i) => `- ${i.name}${i.note ? ` (${i.note})` : ''}`))
  }
  return out.join('\n')
}

// ───────────── Writing ─────────────

export interface RecipeInput {
  title: string
  summary?: string
  time_minutes?: number
  servings?: number
  ingredients: { name: string; amount?: string }[]
  steps: string[]
  source_url?: string
}

const STAPLES = /^(salt|kosher salt|sea salt|table salt|black pepper|ground black pepper|pepper|water)$/i

export async function saveRecipe(key: string, input: RecipeInput): Promise<string> {
  const s = await snapshot(key)
  const kitchen = kitchenOf(s)
  const hasUnits = (p: Product) => !!kitchen.unitsByProduct.get(p.id)?.length
  const draft: RecipeDraft = {
    title: input.title.trim(),
    summary: input.summary?.trim() ?? '',
    time_minutes: input.time_minutes ? Math.round(input.time_minutes) : null,
    servings: input.servings ? Math.round(input.servings) : null,
    ingredients: input.ingredients.map((i) => {
      const staple = STAPLES.test(i.name.trim())
      return {
        name: i.name.trim(),
        amount: i.amount?.trim() ?? '',
        product_id: staple ? null : (findProduct(i.name, s.products, hasUnits)?.id ?? null),
        staple,
      }
    }),
    steps: input.steps.map((x) => x.trim()).filter(Boolean),
  }
  await rpc<string>('agent_save_recipe', { p_key: key, p_recipe: { ...draft, source_url: input.source_url ?? null } })

  const matched = matchRecipe(draft, kitchen)
  const name = (m: (typeof matched)[number]) => ingredientLine(m.ingredient).rest.split(',')[0]
  const have = matched.filter((m) => m.state === 'have' || m.state === 'low')
  const missing = matched.filter((m) => m.state === 'missing')
  const lines = [`Saved "${draft.title}" to the ${s.household.name} recipe box.`]
  if (have.length) lines.push(`In the kitchen: ${have.map(name).join(', ')}.`)
  lines.push(missing.length ? `Not in the kitchen: ${missing.map(name).join(', ')}.` : 'Everything needed is in the kitchen.')
  return lines.join('\n')
}

export async function addToList(key: string, items: { name: string; note?: string }[]): Promise<string> {
  const s = await snapshot(key)
  const rows = items
    .filter((i) => i.name.trim())
    .map((i) => {
      const product = findProduct(i.name, s.products)
      return {
        name: product?.name ?? i.name.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase()),
        product_id: product?.id ?? null,
        category: product?.category ?? categorize([], i.name),
        note: i.note?.trim() || null,
      }
    })
  const added = await rpc<number>('agent_add_to_list', { p_key: key, p_items: rows })
  const skipped = rows.length - added
  return (
    `Added ${added} item${added === 1 ? '' : 's'} to the shopping list.` +
    (skipped ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} already on it.` : '')
  )
}
