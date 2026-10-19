import { supabase } from './supabase'
import type { Household } from './types'

/** Used when no Supabase project is configured: everything stays on this device. */
export const LOCAL_HOUSEHOLD: Household = {
  id: '00000000-0000-4000-8000-000000000000',
  name: 'My Kitchen',
  invite_code: '',
  categories: [],
}

const CACHE_KEY = 'pantry.household'
const PENDING_JOIN_KEY = 'pantry.pendingJoin'

export function cachedHousehold(): Household | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Household) : null
  } catch {
    return null
  }
}

export function cacheHousehold(h: Household | null) {
  if (h) localStorage.setItem(CACHE_KEY, JSON.stringify(h))
  else localStorage.removeItem(CACHE_KEY)
}

/** Remember an invite code from `?join=…` until the person has signed in. */
export function capturePendingJoin() {
  const url = new URL(location.href)
  const code = url.searchParams.get('join')
  if (!code) return
  localStorage.setItem(PENDING_JOIN_KEY, code)
  url.searchParams.delete('join')
  history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export function takePendingJoin(): string | null {
  const code = localStorage.getItem(PENDING_JOIN_KEY)
  localStorage.removeItem(PENDING_JOIN_KEY)
  return code
}

/** Accepts a bare code or a full invite link. */
export function parseInviteCode(input: string): string {
  const trimmed = input.trim()
  try {
    return new URL(trimmed).searchParams.get('join') ?? trimmed
  } catch {
    return trimmed
  }
}

export function inviteLink(h: Household): string {
  return `${location.origin}/?join=${h.invite_code}`
}

/** The household to open: `preferId` (just joined), else the one last used here, else the oldest. */
export async function fetchMyHousehold(preferId?: string | null): Promise<Household | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('households').select('id, name, invite_code, categories, recipe_notes').order('created_at')
  if (error) throw error
  const all = (data ?? []) as Household[]
  const lastUsed = cachedHousehold()?.id
  return all.find((h) => h.id === preferId) ?? all.find((h) => h.id === lastUsed) ?? all[0] ?? null
}

export async function createHousehold(name: string, displayName: string): Promise<Household> {
  const { data, error } = await supabase!.rpc('create_household', { p_name: name, p_display_name: displayName })
  if (error) throw error
  return data as Household
}

export async function joinHousehold(code: string, displayName: string | null): Promise<string> {
  const { data, error } = await supabase!.rpc('join_household', { p_code: code, p_display_name: displayName })
  if (error) throw error
  return data as string
}

export async function updateHousehold(id: string, patch: Partial<Pick<Household, 'name' | 'categories' | 'recipe_notes'>>) {
  if (!supabase) return
  const { error } = await supabase.from('households').update(patch).eq('id', id)
  if (error) throw error
}

export async function fetchMembers(householdId: string): Promise<{ user_id: string; display_name: string | null }[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, display_name')
    .eq('household_id', householdId)
    .order('joined_at')
  if (error) throw error
  return data ?? []
}

// ───────────── Claude connection keys ─────────────

export interface AgentKey {
  id: string
  label: string
  created_at: string
  last_used_at: string | null
}

export async function listAgentKeys(householdId: string): Promise<AgentKey[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('agent_keys')
    .select('id, label, created_at, last_used_at')
    .eq('household_id', householdId)
    .is('revoked_at', null)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

/** Returns the key itself; only its hash is stored, so this is the one chance to copy it. */
export async function createAgentKey(householdId: string, label: string): Promise<string> {
  const { data, error } = await supabase!.rpc('create_agent_key', { p_household: householdId, p_label: label })
  if (error) throw error
  return data as string
}

export async function revokeAgentKey(id: string): Promise<void> {
  const { error } = await supabase!.rpc('revoke_agent_key', { p_id: id })
  if (error) throw error
}

export function connectorUrl(key: string): string {
  return `${location.origin}/api/mcp?key=${key}`
}
