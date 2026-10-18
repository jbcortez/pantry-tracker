/**
 * Vercel Function: proxies UPCitemdb's free lookup, which doesn't allow browser calls.
 * GET /api/upc?upc=041331124027
 */
export async function GET(request: Request): Promise<Response> {
  const upc = new URL(request.url).searchParams.get('upc') ?? ''
  if (!/^\d{6,14}$/.test(upc)) {
    return Response.json({ error: 'upc must be 6–14 digits' }, { status: 400 })
  }
  const upstream = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, {
    headers: { Accept: 'application/json' },
  })
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      // Product data rarely changes; cache hits don't count against the daily limit.
      'Cache-Control': upstream.ok ? 'public, s-maxage=604800' : 'no-store',
    },
  })
}
