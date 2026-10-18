import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const parse = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status = 500
  }
  class Anthropic {
    static APIError = APIError
    static AuthenticationError = class extends APIError {}
    static RateLimitError = class extends APIError {}
    beta = { messages: { parse } }
  }
  return { default: Anthropic }
})

const { POST: recipes } = await import('../recipes')
const { POST: importRecipe } = await import('../import-recipe')

const INVENTORY = [
  { id: 'p-spinach', name: 'Spinach', category: 'Produce', quantity: '1', days_left: 1 },
  { id: 'p-beans', name: 'Black Beans', category: 'Canned & Jarred', quantity: '2', days_left: 700 },
]

const RECIPE = {
  title: 'Spinach & Bean Quesadillas',
  summary: 'Uses the spinach before it wilts.',
  time_minutes: 19.6,
  servings: 2,
  ingredients: [
    { name: 'spinach', amount: '2 cups', product_id: 'p-spinach', staple: false },
    { name: 'black beans', amount: '1 can', product_id: 'p-made-up', staple: false },
    { name: 'salt', amount: 'to taste', product_id: null, staple: true },
  ],
  steps: ['Warm the beans.', 'Fill and toast the tortillas.'],
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://x/api', { method: 'POST', headers, body: JSON.stringify(body) })

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test'
  delete process.env.VITE_SUPABASE_URL
  delete process.env.VITE_SUPABASE_KEY
  parse.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/recipes', () => {
  it('asks Claude with the inventory and preferences, and cleans up the answer', async () => {
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { recipes: [RECIPE] } })
    const res = await recipes(post({ inventory: INVENTORY, maxMinutes: 30, servings: 2, notes: 'No pork' }))
    expect(res.status).toBe(200)
    const { recipes: out } = await res.json()
    expect(out[0].time_minutes).toBe(20)
    // Invented ids are dropped; real ones kept.
    expect(out[0].ingredients.map((i: { product_id: string | null }) => i.product_id)).toEqual(['p-spinach', null, null])

    const req = parse.mock.calls[0][0]
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.fallbacks).toBe('default')
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(req.output_config.effort).toBe('medium')
    const prompt = req.messages[0].content as string
    expect(prompt).toContain('[p-spinach] Spinach')
    expect(prompt).toContain('use within 1d')
    expect(prompt).toContain('at most 30 minutes')
    expect(prompt).toContain('No pork')
  })

  it('needs an API key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    expect((await recipes(post({ inventory: INVENTORY }))).status).toBe(503)
  })

  it('needs something in the kitchen', async () => {
    expect((await recipes(post({ inventory: [] }))).status).toBe(400)
    expect(parse).not.toHaveBeenCalled()
  })

  it('reports refusals plainly', async () => {
    parse.mockResolvedValue({ stop_reason: 'refusal', parsed_output: null })
    expect((await recipes(post({ inventory: INVENTORY }))).status).toBe(422)
  })

  it('requires a signed-in user when sync is configured', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    process.env.VITE_SUPABASE_KEY = 'pk'
    const res = await recipes(post({ inventory: INVENTORY }))
    expect(res.status).toBe(401)
    expect(parse).not.toHaveBeenCalled()
  })
})

describe('POST /api/import-recipe', () => {
  it('reads schema.org JSON-LD instead of the whole page', async () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Bean Soup"}</script></head><body>${'ads '.repeat(5000)}</body></html>`
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })))
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { found: true, recipe: RECIPE } })
    const res = await importRecipe(post({ url: 'https://recipes.example.com/soup', inventory: INVENTORY }))
    expect(res.status).toBe(200)
    const prompt = parse.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('"@type":"Recipe"')
    expect(prompt).not.toContain('ads ads')
  })

  it('accepts pasted text', async () => {
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { found: true, recipe: RECIPE } })
    const res = await importRecipe(post({ text: 'Bean soup: 1 can beans…', inventory: INVENTORY }))
    expect(res.status).toBe(200)
  })

  it('says so when there is no recipe', async () => {
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { found: false, recipe: RECIPE } })
    expect((await importRecipe(post({ text: 'hello', inventory: [] }))).status).toBe(422)
  })

  it('refuses non-public addresses', async () => {
    for (const url of ['http://localhost:3000/x', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'not a url']) {
      expect((await importRecipe(post({ url, inventory: [] }))).status).toBe(400)
    }
    expect(parse).not.toHaveBeenCalled()
  })
})
