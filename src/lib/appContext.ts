import { createContext, useContext } from 'react'
import type { CategoryDef, Household } from './types'

export interface AppState {
  household: Household
  categories: CategoryDef[]
  /** False in device-only mode. */
  cloud: boolean
  email: string | null
  setHousehold: (h: Household) => void
  signOut: () => Promise<void>
}

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside AppContext')
  return ctx
}

export function categoryOf(categories: CategoryDef[], id: string): CategoryDef {
  return categories.find((c) => c.id === id) ?? categories[categories.length - 1]
}
