import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import {
  anthropic,
  apiError,
  describeInventory,
  json,
  MODEL,
  parseInventory,
  RecipeSchema,
  requireUser,
  sanitize,
} from './_lib/recipe.js'

/**
 * POST /api/recipes
 * { inventory: InventoryItem[], count?, maxMinutes?, servings?, cuisine?, useExpiring?, notes? }
 * → { recipes: Recipe[] }
 */

const SYSTEM = `You suggest recipes inside a household pantry app. The household wants to cook from what they already have and waste less.

Work from the inventory you're given. A recipe may need at most two ingredients they don't have (product_id null); fewer is better, and zero is best. Treat only salt, black pepper and water as always on hand (staple: true). Anything else, including oil, butter and garlic, counts only if it appears in the inventory.

Use each inventory item's exact id in product_id when a recipe uses it. Write ingredient names generically ("black beans", not the brand). Keep steps short and practical for a home cook. Make the recipes genuinely different from one another.`

const ResponseSchema = z.object({ recipes: z.array(RecipeSchema) })

export async function POST(request: Request): Promise<Response> {
  const denied = await requireUser(request)
  if (denied) return denied
  const client = anthropic()
  if (client instanceof Response) return client

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const inventory = parseInventory(body?.inventory)
  if (!inventory.length) return json({ error: 'Your kitchen is empty — add some food first.' }, 400)

  const count = Math.min(5, Math.max(3, Number(body?.count) || 4))
  const asks: string[] = [`Suggest ${count} recipes.`]
  if (Number(body?.maxMinutes) > 0) asks.push(`Each must take at most ${Number(body!.maxMinutes)} minutes in total.`)
  if (Number(body?.servings) > 0) asks.push(`Each should serve ${Number(body!.servings)}.`)
  if (typeof body?.cuisine === 'string' && body.cuisine.trim()) asks.push(`Cuisine or style: ${body.cuisine.trim().slice(0, 100)}.`)
  if (body?.useExpiring !== false) {
    asks.push('Prioritize items that are expired or need using within a few days; build at least one recipe around them.')
  }
  if (typeof body?.notes === 'string' && body.notes.trim()) {
    asks.push(`Household preferences (always follow): ${body.notes.trim().slice(0, 1000)}`)
  }

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(ResponseSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Inventory (id in brackets):\n${describeInventory(inventory)}\n\n${asks.join('\n')}`,
        },
      ],
    })
    if (response.stop_reason === 'refusal') {
      return json({ error: 'Couldn’t suggest recipes for that request. Try different preferences.' }, 422)
    }
    if (!response.parsed_output) {
      return json({ error: 'The recipe service returned something unexpected. Try again.' }, 502)
    }
    return json({ recipes: response.parsed_output.recipes.map((r) => sanitize(r, inventory)) })
  } catch (err) {
    return apiError(err)
  }
}
