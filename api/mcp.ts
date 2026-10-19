import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
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
 * MCP connector for Claude: https://<app>/api/mcp?key=<household key>
 * (or an `Authorization: Bearer <key>` header). Stateless: each request gets a fresh server.
 */

const INSTRUCTIONS = `Pantry is this household's shared food inventory app. Before suggesting meals or recipes, call get_inventory and cook from what's there, using the USE SOON items first, and always follow the household preferences it lists. Treat salt, pepper and water as available; anything else counts only if it's in the inventory. When the person likes a recipe, offer to save it with save_recipe so it shows up in the app's recipe box, where they can cook from it and deduct ingredients. Use add_to_shopping_list for anything they need to buy.`

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }] }
}

function failure(err: unknown) {
  const message = err instanceof AgentError ? err.message : 'Pantry had a problem. Try again.'
  if (!(err instanceof AgentError)) console.error(err)
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

function buildServer(key: string): McpServer {
  const server = new McpServer({ name: 'pantry', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'get_inventory',
    {
      title: 'Read the kitchen inventory',
      description:
        'Everything in the household kitchen with quantities and use-by dates, the items to use soon, household food preferences, and saved recipe titles.',
      inputSchema: {
        location: z.enum(['pantry', 'fridge', 'freezer']).optional().describe('Only show one location'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ location }) => {
      try {
        return text(formatInventory(await snapshot(key), { location }))
      } catch (err) {
        return failure(err)
      }
    },
  )

  server.registerTool(
    'get_shopping_list',
    {
      title: 'Read the shopping list',
      description: 'What is currently on the household shopping list, grouped by store aisle.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return text(formatShoppingList(await snapshot(key)))
      } catch (err) {
        return failure(err)
      }
    },
  )

  server.registerTool(
    'save_recipe',
    {
      title: 'Save a recipe to the recipe box',
      description:
        'Saves a recipe to the household recipe box in the Pantry app, where they can cook it and deduct ingredients. Ingredients are matched to the inventory automatically. Returns which ingredients are and aren’t in the kitchen.',
      inputSchema: {
        title: z.string().min(1),
        summary: z.string().optional().describe('One sentence about the dish'),
        time_minutes: z.number().positive().optional().describe('Total time in minutes'),
        servings: z.number().positive().optional(),
        ingredients: z
          .array(
            z.object({
              name: z.string().min(1).describe('Generic food name, e.g. "black beans"'),
              amount: z.string().optional().describe('e.g. "1 can", "2 cups", "to taste"'),
            }),
          )
          .min(1),
        steps: z.array(z.string()).min(1),
        source_url: z.string().url().optional().describe('Where the recipe came from, if from the web'),
      },
    },
    async (input) => {
      try {
        return text(await saveRecipe(key, input))
      } catch (err) {
        return failure(err)
      }
    },
  )

  server.registerTool(
    'add_to_shopping_list',
    {
      title: 'Add to the shopping list',
      description:
        'Adds items to the household shopping list. Items already on the list are skipped. Use a note like "For Bean Tacos" when adding for a recipe.',
      inputSchema: {
        items: z
          .array(z.object({ name: z.string().min(1), note: z.string().optional() }))
          .min(1),
      },
    },
    async ({ items }) => {
      try {
        return text(await addToList(key, items))
      } catch (err) {
        return failure(err)
      }
    },
  )

  return server
}

export async function POST(request: Request): Promise<Response> {
  const key = keyFrom(request)
  if (!key) return Response.json({ error: 'Missing Pantry key. Create one in the app under Settings → Claude.' }, { status: 401 })
  try {
    await checkKey(key)
  } catch (err) {
    if (!(err instanceof AgentError)) console.error(err)
    const message = err instanceof AgentError ? err.message : 'Pantry had a problem.'
    // A bad key is the caller's problem; anything else (e.g. server not configured) isn't.
    return Response.json({ error: message }, { status: /key/i.test(message) ? 401 : 503 })
  }
  const server = buildServer(key)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  return transport.handleRequest(request)
}

/** No server-initiated streams or sessions in stateless mode. */
export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } })
}

export const DELETE = GET
