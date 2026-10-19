/**
 * The project URL as Supabase's client expects it: just `https://<ref>.supabase.co`.
 * Tolerates what people commonly paste instead: the `/rest/v1/` endpoint, a trailing slash,
 * surrounding whitespace, or the dashboard page (`supabase.com/dashboard/project/<ref>`).
 */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  try {
    const url = new URL(/^https?:\/\//.test(value) ? value : `https://${value}`)
    const ref = url.pathname.match(/\/project\/([a-z0-9]+)/)?.[1]
    if (/(^|\.)supabase\.com$/.test(url.hostname) && ref) return `https://${ref}.supabase.co`
    return url.origin
  } catch {
    return value
  }
}
