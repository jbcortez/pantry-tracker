import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { createProduct, putAway, type Result } from '../lib/actions'
import { categoryOf, useApp } from '../lib/appContext'
import { defaultLocation, defaultTracking } from '../lib/categories'
import { db } from '../lib/db'
import { makeDraft } from '../lib/lookup'
import { QUICK_ADD } from '../lib/quickAdd'
import type { Product, ProductDraft } from '../lib/types'
import { inputClass, Sheet } from './ui'

interface Option {
  key: string
  name: string
  icon: string
  /** Set when the household already has this item. */
  product?: Product
  category: string
}

/** One-tap adding for produce and other things without a barcode. */
export function QuickAddSheet({
  open,
  onClose,
  onAdded,
  onCustom,
}: {
  open: boolean
  onClose: () => void
  onAdded: (product: Product, r: Result) => void
  onCustom: (draft: ProductDraft) => void
}) {
  const { household, categories } = useApp()
  const [q, setQ] = useState('')
  const noBarcode = useLiveQuery(
    () =>
      db.products
        .where('household_id')
        .equals(household.id)
        .filter((p) => !p.barcode && !p.deleted_at)
        .toArray(),
    [household.id],
  )

  const options = useMemo(() => {
    const own: Option[] = (noBarcode ?? []).map((p) => ({
      key: p.id,
      name: p.name,
      icon: categoryOf(categories, p.category).icon,
      product: p,
      category: p.category,
    }))
    const ownNames = new Set(own.map((o) => o.name.toLowerCase()))
    const presets: Option[] = QUICK_ADD.filter((i) => !ownNames.has(i.name.toLowerCase())).map((i) => ({
      key: `preset:${i.name}`,
      ...i,
    }))
    const query = q.trim().toLowerCase()
    const all = [...own.sort((a, b) => a.name.localeCompare(b.name)), ...presets]
    return query ? all.filter((o) => o.name.toLowerCase().includes(query)) : all
  }, [noBarcode, categories, q])

  const pick = async (o: Option) => {
    onClose()
    setQ('')
    if (o.product) {
      onAdded(o.product, await putAway(o.product))
      return
    }
    const draft: ProductDraft = {
      ...makeDraft({ barcode: null, name: o.name }, [], 'quick'),
      category: o.category,
      default_location: defaultLocation(o.category, o.name),
      tracking: defaultTracking(o.category, o.name),
    }
    const { product, ...r } = await createProduct(household.id, draft, {
      location: draft.default_location,
      count: 1,
      useBy: null,
    })
    onAdded(product, r)
  }

  const custom = () => {
    const name = q.trim()
    onClose()
    setQ('')
    onCustom(makeDraft({ barcode: null, name }, [], 'manual'))
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add without a barcode">
      <input
        className={`${inputClass} mb-3`}
        placeholder="Search or type a new item…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => void pick(o)}
            className="flex flex-col items-center gap-1 rounded-xl border border-stone-200 bg-white px-1 py-3 text-center text-sm active:bg-stone-100"
          >
            <span className="text-2xl">{o.icon}</span>
            <span className="leading-tight">{o.name}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={custom}
        className="mt-3 w-full rounded-xl border border-dashed border-stone-300 px-3 py-3 text-sm text-stone-700 active:bg-stone-100"
      >
        ＋ {q.trim() ? `Add “${q.trim()}” as a new item` : 'Something else…'}
      </button>
    </Sheet>
  )
}
