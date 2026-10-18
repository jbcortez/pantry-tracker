import { categoryOf, useApp } from '../lib/appContext'
import { describeUseBy, urgency } from '../lib/dates'
import { describeQuantity } from '../lib/inventory'
import type { Group } from '../lib/useKitchen'
import { LOCATIONS, type Product } from '../lib/types'
import { cx } from './ui'

export function ProductThumb({ product, size = 44 }: { product: Product; size?: number }) {
  const { categories } = useApp()
  const style = { width: size, height: size }
  if (product.image_url) {
    return (
      <img
        src={product.image_url}
        alt=""
        loading="lazy"
        style={style}
        className="shrink-0 rounded-xl bg-white object-contain ring-1 ring-stone-200"
      />
    )
  }
  return (
    <div style={style} className="flex shrink-0 items-center justify-center rounded-xl bg-stone-100 text-2xl">
      {categoryOf(categories, product.category).icon}
    </div>
  )
}

export function UseByChip({ date }: { date: string | null }) {
  if (!date) return null
  const u = urgency(date)
  return (
    <span
      className={cx(
        'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        u === 'expired' && 'bg-red-100 text-red-700',
        u === 'soon' && 'bg-amber-100 text-amber-800',
        u === 'ok' && 'bg-stone-100 text-stone-600',
      )}
    >
      {describeUseBy(date)}
    </span>
  )
}

export function ItemRow({ group, onClick, showLocation }: { group: Group; onClick: () => void; showLocation?: boolean }) {
  const { product } = group
  const loc = LOCATIONS.find((l) => l.id === group.location)!
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-stone-50">
      <ProductThumb product={product} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{product.name}</div>
        <div className="flex items-center gap-1.5 truncate text-xs text-stone-500">
          {showLocation && <span>{loc.label}</span>}
          {showLocation && product.brand && <span>·</span>}
          {product.brand && <span className="truncate">{product.brand}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums">{describeQuantity(product, group.units)}</span>
        <UseByChip date={group.nextUseBy} />
      </div>
    </button>
  )
}
