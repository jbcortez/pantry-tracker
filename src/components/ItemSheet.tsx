import { useState } from 'react'
import { addProductToList, moveGroup, putAway, removeUnits, setStaple, updateProduct, updateUnit } from '../lib/actions'
import { useApp } from '../lib/appContext'
import { levelLabel, LEVELS } from '../lib/inventory'
import { useByAfterOpening } from '../lib/shelfLife'
import type { Undo } from '../lib/store'
import { LOCATIONS, type Product, type Tracking, type Unit } from '../lib/types'
import type { Group } from '../lib/useKitchen'
import { ProductThumb, UseByChip } from './ItemBits'
import { useToast } from './Toast'
import { Button, cx, Field, inputClass, Segmented, Sheet } from './ui'

export function ItemSheet({ group, onClose }: { group: Group | null; onClose: () => void }) {
  return (
    <Sheet open={!!group} onClose={onClose} title={group?.product.name}>
      {group && <ItemDetails key={group.key} group={group} onClose={onClose} />}
    </Sheet>
  )
}

function ItemDetails({ group, onClose }: { group: Group; onClose: () => void }) {
  const { product, units, location } = group
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const sorted = [...units].sort(
    (a, b) => Number(!!b.opened_at) - Number(!!a.opened_at) || (a.use_by ?? '').localeCompare(b.use_by ?? ''),
  )

  const run = async (label: string, op: Promise<Undo>) => toast({ message: label, undo: await op })
  const report = (label: string, r: { undo: Undo; listed?: boolean }) =>
    toast({ message: r.listed ? `${label} · added to shopping list` : label, undo: r.undo })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <ProductThumb product={product} size={56} />
        <div className="min-w-0 text-sm text-stone-600">
          {[product.brand, product.package_size].filter(Boolean).join(' · ') || 'No brand'}
          {product.barcode && <div className="text-xs text-stone-400">Barcode {product.barcode}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          aria-pressed={!!product.staple}
          variant={product.staple ? 'accent' : 'secondary'}
          onClick={async () => {
            const r = await setStaple(product, !product.staple)
            report(product.staple ? 'No longer a staple' : 'Staple: keeps itself on the list when low', r)
          }}
        >
          {product.staple ? '★ Staple' : '☆ Keep stocked'}
        </Button>
        <Button
          onClick={async () => {
            const undo = await addProductToList(product)
            toast(undo ? { message: 'Added to shopping list', undo } : { message: 'Already on the list' })
          }}
        >
          ＋ Shopping list
        </Button>
      </div>

      <Field label="Location" group>
        <Segmented
          value={location}
          onChange={(to) => {
            void run(`Moved to ${LOCATIONS.find((l) => l.id === to)!.label}`, moveGroup(product, units, to))
            onClose()
          }}
          options={LOCATIONS.map((l) => ({ value: l.id, label: l.label }))}
        />
      </Field>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
            {units.length} {units.length === 1 ? 'package' : 'packages'}
          </span>
          <Button
            variant="ghost"
            onClick={async () => {
              const r = await putAway(product, { location })
              toast({ message: `Added 1 · ${r.remaining} on hand`, undo: r.undo })
            }}
          >
            ＋ Add one
          </Button>
        </div>
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {sorted.map((u) => (
            <UnitRow key={u.id} unit={u} product={product} onDone={report} />
          ))}
        </ul>
      </div>

      {editing ? (
        <EditProduct product={product} onDone={() => setEditing(false)} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => setEditing(true)}>Edit details</Button>
          <Button
            variant="danger"
            onClick={async () => {
              onClose()
              report(`Removed ${product.name}`, await removeUnits(product, units))
            }}
          >
            Remove all
          </Button>
        </div>
      )}
    </div>
  )
}

function UnitRow({
  unit,
  product,
  onDone,
}: {
  unit: Unit
  product: Product
  onDone: (label: string, r: { undo: Undo; listed?: boolean }) => void
}) {
  const setLevel = async (level: number) => {
    const use_by = unit.opened_at
      ? unit.use_by
      : useByAfterOpening(unit.use_by, product.category, unit.location, product.name)
    onDone(
      `${levelLabel(level)} left`,
      await updateUnit(product, unit, { level, opened_at: unit.opened_at ?? new Date().toISOString(), use_by }),
    )
  }
  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {unit.opened_at ? (product.tracking === 'level' ? `Open · ${levelLabel(unit.level)} left` : 'Open') : 'Unopened'}
        </span>
        <div className="flex items-center gap-2">
          <UseByChip date={unit.use_by} />
          <button
            type="button"
            aria-label="Remove this package"
            className="rounded-full px-2 py-1 text-stone-400 active:bg-stone-100"
            onClick={async () => onDone('Removed 1', await removeUnits(product, [unit]))}
          >
            🗑
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {product.tracking === 'level' &&
          LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => void setLevel(l)}
              className={cx(
                'rounded-lg border px-2.5 py-1 text-xs',
                unit.opened_at && Math.abs(unit.level - l) < 0.1
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-stone-200 text-stone-600',
              )}
            >
              {levelLabel(l)}
            </button>
          ))}
        <input
          type="date"
          aria-label="Use by"
          className="ml-auto rounded-lg border border-stone-200 px-2 py-1 text-xs"
          value={unit.use_by ?? ''}
          onChange={async (e) => onDone('Date updated', await updateUnit(product, unit, { use_by: e.target.value || null }))}
        />
      </div>
    </li>
  )
}

/** Corrections here are remembered for this product (and its barcode) for the whole household. */
function EditProduct({ product, onDone }: { product: Product; onDone: () => void }) {
  const { categories } = useApp()
  const toast = useToast()
  const [name, setName] = useState(product.name)
  const [brand, setBrand] = useState(product.brand ?? '')
  const [category, setCategory] = useState(product.category)
  const [tracking, setTracking] = useState<Tracking>(product.tracking)

  return (
    <form
      className="space-y-3 rounded-xl bg-stone-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const undo = await updateProduct(product, { name: name.trim() || product.name, brand: brand.trim() || null, category, tracking })
        toast({ message: 'Saved — remembered for next time', undo })
        onDone()
      }}
    >
      <Field label="Name">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Brand">
        <input className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)} />
      </Field>
      <Field label="Category">
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="How do you use it up?" group>
        <Segmented<Tracking>
          value={tracking}
          onChange={setTracking}
          options={[
            { value: 'count', label: 'Whole items' },
            { value: 'level', label: 'A bit at a time' },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  )
}
