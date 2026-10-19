import { describe, expect, it } from 'vitest'
import { normalizeSupabaseUrl } from './supabaseUrl'

describe('normalizeSupabaseUrl', () => {
  it('keeps a correct URL', () => {
    expect(normalizeSupabaseUrl('https://abcdefgh.supabase.co')).toBe('https://abcdefgh.supabase.co')
  })

  it('strips paths, slashes and whitespace', () => {
    expect(normalizeSupabaseUrl(' https://abcdefgh.supabase.co/rest/v1/ ')).toBe('https://abcdefgh.supabase.co')
    expect(normalizeSupabaseUrl('https://abcdefgh.supabase.co/')).toBe('https://abcdefgh.supabase.co')
    expect(normalizeSupabaseUrl('abcdefgh.supabase.co')).toBe('https://abcdefgh.supabase.co')
  })

  it('turns a dashboard link into the project URL', () => {
    expect(normalizeSupabaseUrl('https://supabase.com/dashboard/project/abcdefgh/settings/api')).toBe(
      'https://abcdefgh.supabase.co',
    )
  })

  it('treats blank as not configured', () => {
    expect(normalizeSupabaseUrl('')).toBeUndefined()
    expect(normalizeSupabaseUrl(undefined)).toBeUndefined()
  })
})
