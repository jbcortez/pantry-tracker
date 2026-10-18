import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/** Shared by the recipe endpoints. Files under api/_lib aren't routes. */

export const MODEL = 'claude-opus-5-5'

export const IngredientSchema = z.object({
  name: z.string().describe('Short generic name, e.g. "black beans", "yellow onion"'),
  amount: z.string().describe('Free-text amount, e.g. "1 can", "2 cups", "a handful"'),
  product_id: z
    .string()
    .nullable()
    .describe('The id of the matching inventory item, or null if it is not in the inventory'),
  staple: z.boolean().describe('True only for salt, black pepper and water, which are assumed on hand'),
})

export const RecipeSchema = z.object({
  title: z.string(),
  summary: z.string().describe('One sentence on what it is and why it suits what they have'),
  // Plain numbers: .int() adds bounds structured outputs can't express, which end up as prompt noise.
  time_minutes: z.number().describe('Total time in whole minutes'),
  servings: z.number().describe('Number of servings, a whole number'),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
})

export type RecipeOut = z.infer<typeof RecipeSchema>

export interface InventoryItem {
  id: string
  name: string
  category: string
  quantity: string
  days_left: number | null
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * When the app has Supabase configured, only signed-in household members may spend
 * AI credit. Device-only setups (no Supabase) are left open for local use.
 */
export async function requireUser(request: Request): Promise<Response | null> {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_KEY
  if (!url || !key) return null
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sign in to use recipes.' }, 401)
  const { data, error } = await createClient(url, key).auth.getUser(token)
  if (error || !data.user) return json({ error: 'Your session expired. Sign in again.' }, 401)
  return null
}

export function anthropic(): Anthropic | Response {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'Recipes aren’t set up yet: add ANTHROPIC_API_KEY in Vercel (see docs/SETUP.md).' }, 503)
  }
  return new Anthropic()
}

export function describeInventory(items: InventoryItem[]): string {
  return items
    .map((i) => {
      const expiry =
        i.days_left == null ? '' : i.days_left < 0 ? ' — EXPIRED' : i.days_left <= 3 ? ` — use within ${i.days_left}d` : ''
      return `- [${i.id}] ${i.name} (${i.category}; have ${i.quantity})${expiry}`
    })
    .join('\n')
}

/** Drop product ids the model invented (keeping the ingredient as "not in inventory"); tidy numbers. */
export function sanitize(recipe: RecipeOut, inventory: InventoryItem[]): RecipeOut {
  const ids = new Set(inventory.map((i) => i.id))
  return {
    ...recipe,
    time_minutes: Math.max(1, Math.round(recipe.time_minutes)),
    servings: Math.max(1, Math.round(recipe.servings)),
    ingredients: recipe.ingredients.map((ing) => ({
      ...ing,
      product_id: ing.product_id && ids.has(ing.product_id) ? ing.product_id : null,
    })),
  }
}

export function parseInventory(value: unknown): InventoryItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is InventoryItem => !!v && typeof v === 'object' && typeof v.id === 'string' && typeof v.name === 'string')
    .slice(0, 400)
    .map((v) => ({
      id: v.id,
      name: String(v.name).slice(0, 120),
      category: String(v.category ?? '').slice(0, 60),
      quantity: String(v.quantity ?? '').slice(0, 40),
      days_left: typeof v.days_left === 'number' ? v.days_left : null,
    }))
}

/** Maps Claude API failures to messages a person can act on. */
export function apiError(err: unknown): Response {
  if (err instanceof Anthropic.AuthenticationError) return json({ error: 'The Anthropic API key is invalid.' }, 503)
  if (err instanceof Anthropic.RateLimitError) return json({ error: 'Too many requests right now. Try again in a minute.' }, 429)
  if (err instanceof Anthropic.APIError) {
    console.error('Claude API error', err.status, err.message)
    return json({ error: 'The recipe service had a problem. Try again.' }, 502)
  }
  console.error(err)
  return json({ error: 'Something went wrong.' }, 500)
}
