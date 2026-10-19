import {
  addToList,
  AgentError,
  checkKey,
  formatInventory,
  formatShoppingList,
  keyFrom,
  saveRecipe,
  snapshot,
} from './_lib/agent.js'

/**
 * Plain-text endpoint for the `pantry` CLI (cli/pantry.mjs), with the same abilities as
 * the MCP connector. POST { command, ...args } with `Authorization: Bearer <household key>`.
 */
export async function POST(request: Request): Promise<Response> {
  const key = keyFrom(request)
  if (!key) return plain('Missing Pantry key. Run: pantry setup <app-url> <key>', 401)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  try {
    switch (body?.command) {
      case 'check':
        return plain(`Connected to ${await checkKey(key)}.`)
      case 'inventory': {
        const location = ['pantry', 'fridge', 'freezer'].find((l) => l === body.location) as
          | 'pantry'
          | 'fridge'
          | 'freezer'
          | undefined
        return plain(formatInventory(await snapshot(key), { location }))
      }
      case 'list':
        return plain(formatShoppingList(await snapshot(key)))
      case 'save-recipe': {
        const r = body.recipe as Record<string, unknown> | undefined
        if (!r || typeof r.title !== 'string' || !Array.isArray(r.ingredients) || !Array.isArray(r.steps)) {
          return plain('A recipe needs "title", "ingredients" ([{name, amount}]) and "steps" ([...]).', 400)
        }
        return plain(await saveRecipe(key, r as never))
      }
      case 'add-to-list': {
        const items = Array.isArray(body.items) ? (body.items as { name: string; note?: string }[]) : []
        if (!items.length) return plain('Nothing to add.', 400)
        return plain(await addToList(key, items))
      }
      default:
        return plain('Unknown command. Try: check, inventory, list, save-recipe, add-to-list.', 400)
    }
  } catch (err) {
    if (err instanceof AgentError) return plain(err.message, /key/i.test(err.message) ? 401 : 400)
    console.error(err)
    return plain('Pantry had a problem. Try again.', 500)
  }
}

function plain(text: string, status = 200): Response {
  return new Response(`${text}\n`, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}
