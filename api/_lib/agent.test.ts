import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from '../../src/lib/dates'
import type { Product, Unit } from '../../src/lib/types'

// The database side (keys, agent_* functions) is tested in SQL; here Supabase is a stub.
const rpc = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }))

const { formatInventory, formatShoppingList, saveRecipe, addToList } = await import('./agent')
const { POST: mcp, GET: mcpGet } = await import('../mcp')
const { POST: agent } = await import('../agent')

const now = new Date()
const at = now.toISOString()

function product(id: string, name: string, category: string, over: Partial<Product> = {}): Product {
  return {
    id,
    household_id: 'h',
    barcode: null,
    name,
    brand: null,
    package_size: null,
    image_url: null,
    category,
    default_location: 'pantry',
    tracking: 'count',
    source: 'manual',
    created_at: at,
    updated_at: at,
    deleted_at: null,
    ...over,
  }
}

function unit(productId: string, location: Unit['location'], days: number, over: Partial<Unit> = {}): Unit {
  return {
    id: `${productId}-${Math.random()}`,
    household_id: 'h',
    product_id: productId,
    location,
    level: 1,
    opened_at: null,
    use_by: addDays(now, days),
    added_at: at,
    updated_at: at,
    deleted_at: null,
    ...over,
  }
}

const SNAPSHOT = {
  household: { name: 'Cortez Kitchen', recipe_notes: 'No pork.', categories: [] },
  products: [
    product('beans', 'Black Beans', 'canned', { brand: 'Goya' }),
    product('spinach', 'Spinach', 'produce'),
    product('flour', 'All-Purpose Flour', 'baking', { tracking: 'level' }),
    product('rice', 'Jasmine Rice', 'grains'),
  ],
  units: [
    unit('beans', 'pantry', 700),
    unit('beans', 'pantry', 700),
    unit('spinach', 'fridge', 1),
    unit('flour', 'pantry', 300, { opened_at: at, level: 0.5 }),
  ],
  shopping: [
    {
      id: 's1',
      household_id: 'h',
      product_id: null,
      name: 'Lemons',
      category: 'produce',
      note: 'For Fish Tacos',
      source: 'recipe',
      checked_at: null,
      created_at: at,
      updated_at: at,
      deleted_at: null,
    },
  ],
  recipes: [{ id: 'r1', title: 'Bean Soup' }],
}

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_KEY = 'pk'
  rpc.mockReset()
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'agent_check') return { data: 'Cortez Kitchen', error: null }
    if (fn === 'agent_snapshot') return { data: SNAPSHOT, error: null }
    if (fn === 'agent_save_recipe') return { data: 'new-id', error: null }
    if (fn === 'agent_add_to_list') return { data: 1, error: null }
    return { data: null, error: { message: `unexpected ${fn}` } }
  })
})

describe('formatInventory', () => {
  it('leads with preferences and what to use soon, then each location by aisle', () => {
    const text = formatInventory(SNAPSHOT as never)
    expect(text).toContain('Household preferences (always follow): No pork.')
    const soon = text.indexOf('USE SOON')
    expect(soon).toBeGreaterThan(0)
    expect(text.slice(soon).split('\n')[1]).toMatch(/^- Spinach: 1, fridge · use tomorrow$/)
    expect(text).toContain('- Black Beans (Goya): 2')
    expect(text).toContain('- All-Purpose Flour: ½ open')
    expect(text.indexOf('PANTRY')).toBeLessThan(text.indexOf('FRIDGE'))
    // Products with nothing on the shelf aren't listed.
    expect(text).not.toContain('Jasmine Rice')
    expect(text).toContain('Saved recipes: Bean Soup')
  })

  it('filters by location', () => {
    const text = formatInventory(SNAPSHOT as never, { location: 'freezer' })
    expect(text).toContain('Nothing in the freezer.')
  })

  it('formats the shopping list', () => {
    expect(formatShoppingList(SNAPSHOT as never)).toContain('- Lemons (For Fish Tacos)')
  })
})

describe('saveRecipe / addToList', () => {
  it('links ingredients to the kitchen and reports what is missing', async () => {
    const reply = await saveRecipe('k', {
      title: 'Bean & Spinach Rice Bowls',
      time_minutes: 24.6,
      ingredients: [
        { name: 'black beans', amount: '1 can' },
        { name: 'baby spinach', amount: '2 cups' },
        { name: 'rice', amount: '1 cup' },
        { name: 'salt', amount: 'to taste' },
      ],
      steps: ['Cook rice.', 'Warm beans.'],
    })
    const saved = rpc.mock.calls.find((c) => c[0] === 'agent_save_recipe')![1].p_recipe
    expect(saved.time_minutes).toBe(25)
    expect(saved.ingredients.map((i: { product_id: string | null }) => i.product_id)).toEqual(['beans', 'spinach', 'rice', null])
    expect(saved.ingredients[3].staple).toBe(true)
    expect(reply).toContain('Saved "Bean & Spinach Rice Bowls" to the Cortez Kitchen recipe box.')
    expect(reply).toContain('In the kitchen: black beans, baby spinach.')
    expect(reply).toContain('Not in the kitchen: rice.')
  })

  it('categorizes new list items and links known products', async () => {
    const reply = await addToList('k', [{ name: 'jasmine rice', note: 'For bowls' }, { name: 'Limes' }])
    const items = rpc.mock.calls.find((c) => c[0] === 'agent_add_to_list')![1].p_items
    expect(items[0]).toMatchObject({ name: 'Jasmine Rice', product_id: 'rice', category: 'grains', note: 'For bowls' })
    expect(items[1]).toMatchObject({ name: 'Limes', product_id: null, category: 'produce', note: null })
    expect(reply).toBe('Added 1 item to the shopping list. 1 was already on it.')
  })
})

const rpcCall = (id: number, method: string, params: unknown = {}) => ({ jsonrpc: '2.0', id, method, params })

function mcpRequest(body: unknown, key: string | null = 'pantry_k') {
  const url = `https://app.example/api/mcp${key ? `?key=${key}` : ''}`
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  })
}

describe('MCP connector', () => {
  it('initializes and lists the four tools', async () => {
    const init = await mcp(
      mcpRequest(rpcCall(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })),
    )
    expect(init.status).toBe(200)
    const initBody = await init.json()
    expect(initBody.result.serverInfo.name).toBe('pantry')
    expect(initBody.result.instructions).toContain('get_inventory')

    const list = await (await mcp(mcpRequest(rpcCall(2, 'tools/list')))).json()
    expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'add_to_shopping_list',
      'get_inventory',
      'get_shopping_list',
      'save_recipe',
    ])
  })

  it('runs a tool call', async () => {
    const res = await mcp(mcpRequest(rpcCall(3, 'tools/call', { name: 'get_inventory', arguments: { location: 'fridge' } })))
    const body = await res.json()
    expect(body.result.isError).toBeFalsy()
    expect(body.result.content[0].text).toContain('- Spinach: 1')
    expect(body.result.content[0].text).not.toContain('Black Beans')
  })

  it('accepts the key as a Bearer header too', async () => {
    const req = new Request('https://app.example/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer pantry_k' },
      body: JSON.stringify(rpcCall(4, 'tools/call', { name: 'get_shopping_list', arguments: {} })),
    })
    expect((await (await mcp(req)).json()).result.content[0].text).toContain('Lemons')
  })

  it('rejects missing and bad keys before doing anything', async () => {
    expect((await mcp(mcpRequest(rpcCall(5, 'tools/list'), null))).status).toBe(401)
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Invalid or revoked Pantry key' } })
    const res = await mcp(mcpRequest(rpcCall(6, 'tools/list'), 'pantry_bad'))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Invalid or revoked Pantry key')
  })

  it('has no GET stream in stateless mode', () => {
    expect(mcpGet().status).toBe(405)
  })
})

describe('CLI endpoint', () => {
  const call = (body: unknown, key = 'pantry_k') =>
    agent(new Request('https://app.example/api/agent', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(body) }))

  it('answers check, inventory and list in plain text', async () => {
    expect(await (await call({ command: 'check' })).text()).toBe('Connected to Cortez Kitchen.\n')
    expect(await (await call({ command: 'inventory', location: 'pantry' })).text()).toContain('Black Beans')
    expect(await (await call({ command: 'list' })).text()).toContain('Lemons')
  })

  it('validates recipes and reports bad keys', async () => {
    expect((await call({ command: 'save-recipe', recipe: { title: 'x' } })).status).toBe(400)
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Invalid or revoked Pantry key' } })
    expect((await call({ command: 'list' }, 'bad')).status).toBe(401)
  })
})
