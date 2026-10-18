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
 * POST /api/import-recipe
 * { url?: string, text?: string, inventory: InventoryItem[] } → { recipe: Recipe }
 * Reads a recipe from a web page (or pasted text) into the app's recipe format,
 * linking ingredients to what the household has.
 */

const MAX_PAGE_BYTES = 3_000_000
const MAX_SOURCE_CHARS = 150_000

const ResponseSchema = z.object({
  found: z.boolean().describe('False if the source contains no recipe'),
  recipe: RecipeSchema,
})

/** Only public http(s) pages — not this server's own network. */
function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (!/^https?:$/.test(url.protocol)) return null
    const host = url.hostname
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^(\d+\.){3}\d+$/.test(host) ||
      host.includes(':')
    )
      return null
    return url
  } catch {
    return null
  }
}

/** Most recipe sites embed schema.org Recipe JSON-LD; it's far smaller and cleaner than the page. */
function recipeJsonLd(html: string): string | null {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const recipes = blocks.filter((b) => /"@type"\s*:\s*(\[[^\]]*)?"Recipe"/.test(b))
  return recipes.length ? recipes.join('\n') : null
}

function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

async function fetchSource(url: URL): Promise<string | Response> {
  let res: globalThis.Response
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PantryApp recipe import)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return json({ error: 'Couldn’t reach that page. Paste the recipe text instead.' }, 422)
  }
  if (!res.ok) return json({ error: `That page returned an error (${res.status}). Paste the recipe text instead.` }, 422)
  const html = (await res.text()).slice(0, MAX_PAGE_BYTES)
  return recipeJsonLd(html) ?? pageText(html)
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireUser(request)
  if (denied) return denied
  const client = anthropic()
  if (client instanceof Response) return client

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const inventory = parseInventory(body?.inventory)

  let source: string
  if (typeof body?.text === 'string' && body.text.trim()) {
    source = body.text.trim()
  } else {
    const url = typeof body?.url === 'string' ? safeUrl(body.url.trim()) : null
    if (!url) return json({ error: 'Enter a full web address starting with https://' }, 400)
    const fetched = await fetchSource(url)
    if (fetched instanceof Response) return fetched
    source = fetched
  }
  if (source.length > MAX_SOURCE_CHARS) {
    return json({ error: 'That page is too long to read. Paste just the recipe text instead.' }, 413)
  }

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(ResponseSchema) },
      system:
        'You copy recipes into a pantry app’s format. Keep the original title, amounts and steps faithful to the source; tidy wording only. Estimate total time and servings if the source omits them. Match each ingredient to an inventory item id when it is the same food, else null; mark only salt, black pepper and water as staples.',
      messages: [
        {
          role: 'user',
          content: `Inventory (id in brackets):\n${describeInventory(inventory) || '(empty)'}\n\nSource:\n<source>\n${source}\n</source>`,
        },
      ],
    })
    if (response.stop_reason === 'refusal') return json({ error: 'Couldn’t import that recipe.' }, 422)
    const out = response.parsed_output
    if (!out) return json({ error: 'Couldn’t read a recipe from that. Try pasting the text.' }, 502)
    if (!out.found) return json({ error: 'No recipe found there. Try pasting the recipe text.' }, 422)
    return json({ recipe: sanitize(out.recipe, inventory) })
  } catch (err) {
    return apiError(err)
  }
}
