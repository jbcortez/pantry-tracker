import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from './db'
import { isLive, nextUp, summarize } from './inventory'
import type { Location, Product, Unit } from './types'

/** One product in one location — a row in the inventory list. */
export interface Group {
  key: string
  product: Product
  location: Location
  units: Unit[]
  nextUseBy: string | null
}

export interface Kitchen {
  ready: boolean
  products: Product[]
  productsById: Map<string, Product>
  unitsByProduct: Map<string, Unit[]>
  groups: Group[]
}

export function useKitchen(householdId: string): Kitchen {
  const products = useLiveQuery(
    () => db.products.where('household_id').equals(householdId).filter((p) => !p.deleted_at).toArray(),
    [householdId],
  )
  const units = useLiveQuery(
    () => db.inventory_units.where('household_id').equals(householdId).filter(isLive).toArray(),
    [householdId],
  )

  return useMemo(() => {
    const productsById = new Map((products ?? []).map((p) => [p.id, p]))
    const unitsByProduct = new Map<string, Unit[]>()
    const byGroup = new Map<string, Unit[]>()
    for (const u of units ?? []) {
      if (!productsById.has(u.product_id)) continue
      unitsByProduct.set(u.product_id, [...(unitsByProduct.get(u.product_id) ?? []), u])
      const key = `${u.product_id}:${u.location}`
      byGroup.set(key, [...(byGroup.get(key) ?? []), u])
    }
    const groups: Group[] = [...byGroup].map(([key, us]) => ({
      key,
      product: productsById.get(us[0].product_id)!,
      location: us[0].location,
      units: us,
      nextUseBy: summarize(us).nextUseBy,
    }))
    groups.sort((a, b) => a.product.name.localeCompare(b.product.name))
    return { ready: !!products && !!units, products: products ?? [], productsById, unitsByProduct, groups }
  }, [products, units])
}

/** For "In your kitchen" chips: the unit you'd use next, soonest-expiring first. */
export function soonestFirst(groups: Group[]): Group[] {
  return [...groups].sort((a, b) =>
    (nextUp(a.units)?.use_by ?? '9999').localeCompare(nextUp(b.units)?.use_by ?? '9999'),
  )
}
