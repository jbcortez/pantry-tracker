import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeSupabaseUrl } from './supabaseUrl'

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const key = (import.meta.env.VITE_SUPABASE_KEY as string | undefined)?.trim()

/** Null when not configured — the app then runs in device-only mode. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
