import { createContext, useContext } from 'react'
import type { RecipeDraft } from './types'

/** "Cook this": the recipe Cooking mode is working through, if any. */
export interface CookingState {
  recipe: RecipeDraft | null
  start: (recipe: RecipeDraft) => void
  stop: () => void
}

export const CookingContext = createContext<CookingState>({ recipe: null, start: () => {}, stop: () => {} })

export const useCooking = () => useContext(CookingContext)
