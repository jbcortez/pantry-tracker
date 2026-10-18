import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { ProductThumb } from '../components/ItemBits'
import { SyncBadge } from '../components/SyncBadge'
import { useToast } from '../components/Toast'
import { Button, cx, inputClass, Sheet } from '../components/ui'
import { addToList, listLowStaples, removeListItems, setStaple, updateListItem } from '../lib/actions'
import { categoryOf, useApp } from '../lib/appContext'
import { categorize } from '../lib/categories'
import { db } from '../lib/db'
import { describeQuantity } from '../lib/inventory'
import { isLow } from '../lib/shopping'
import type { Product, ShoppingItem } from '../lib/types'
import { type Kitchen, useKitchen } from '../lib/useKitchen'

const SOURCE_LABEL: Record<ShoppingItem['source'], string | null> = {
  manual: null,
  staple: '★ Staple',
  ran_out: 'Ran out',
  recipe: 'For a recipe',
}

export function Shopping() {
  const { household, categories } = useApp()
  const kitchen = useKitchen(household.id)
  const toast = useToast()
  const [staplesOpen, setStaplesOpen] = useState(false)

  const items = useLiveQuery(
    () =>
      db.shopping_items
        .where('household_id')
        .equals(household.id)
        .filter((i) => !i.deleted_at)
        .toArray(),
    [household.id],
  )

  const open = useMemo(() => (items ?? []).filter((i) => !i.checked_at), [items])
  const checked = useMemo(
    () => (items ?? []).filter((i) => i.checked_at).sort((a, b) => b.checked_at!.localeCompare(a.checked_at!)),
    [items],
  )

  // Aisle order = category order.
  const sections = useMemo(
    () =>
      categories
        .map((c) => ({
          cat: c,
          items: open
            .filter((i) => categoryOf(categories, i.category).id === c.id)
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((s) => s.items.length),
    [open, categories],
  )

  const toggle = async (item: ShoppingItem) => {
    const undo = await updateListItem(item, { checked_at: item.checked_at ? null : new Date().toISOString() })
    if (!item.checked_at) toast({ message: `Got ${item.name}`, undo })
  }

  const remove = async (item: ShoppingItem) => {
    toast({ message: `Removed ${item.name}`, undo: await removeListItems([item]) })
  }

  return (
    <div className="mx-auto max-w-lg pb-6">
      <header className="safe-top sticky top-0 z-20 space-y-3 bg-[#f6f7f5]/95 px-4 pt-4 pb-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Shopping list</h1>
          <SyncBadge />
        </div>
        <AddItem kitchen={kitchen} />
        <Button className="w-full" onClick={() => setStaplesOpen(true)}>
          ★ Staples
        </Button>
      </header>

      {items && !open.length && !checked.length && (
        <div className="px-6 py-14 text-center">
          <div className="text-5xl">🛒</div>
          <h2 className="mt-3 text-lg font-semibold">Nothing to buy yet</h2>
          <p className="mt-1 text-stone-600">
            Add things above, or mark items as <b>staples</b> so they add themselves when you run low.
          </p>
        </div>
      )}

      {sections.map(({ cat, items }) => (
        <section key={cat.id} className="mx-4 mb-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70">
          <h2 className="px-4 pt-3 pb-1 text-sm font-semibold text-stone-600">
            {cat.icon} {cat.label}
          </h2>
          <ul className="divide-y divide-stone-100">
            {items.map((i) => (
              <ListRow key={i.id} item={i} kitchen={kitchen} onToggle={toggle} onRemove={remove} />
            ))}
          </ul>
        </section>
      ))}

      {checked.length > 0 && (
        <section className="mx-4 mb-4 overflow-hidden rounded-2xl bg-white/60 ring-1 ring-stone-200/70">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h2 className="text-sm font-semibold text-stone-500">In the cart · {checked.length}</h2>
            <Button
              variant="ghost"
              onClick={async () => toast({ message: 'Cleared', undo: await removeListItems(checked) })}
            >
              Clear
            </Button>
          </div>
          <ul className="divide-y divide-stone-100">
            {checked.map((i) => (
              <ListRow key={i.id} item={i} kitchen={kitchen} onToggle={toggle} onRemove={remove} />
            ))}
          </ul>
          <p className="px-4 pt-1 pb-3 text-xs text-stone-500">
            Checking things off doesn’t change your kitchen. Scan them in <b>Putting Away</b> when you get home.
          </p>
        </section>
      )}

      <StaplesSheet open={staplesOpen} onClose={() => setStaplesOpen(false)} kitchen={kitchen} />
    </div>
  )
}

function ListRow({
  item,
  kitchen,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem
  kitchen: Kitchen
  onToggle: (i: ShoppingItem) => void
  onRemove: (i: ShoppingItem) => void
}) {
  const product = item.product_id ? kitchen.productsById.get(item.product_id) : undefined
  const units = item.product_id ? (kitchen.unitsByProduct.get(item.product_id) ?? []) : []
  const done = !!item.checked_at
  const tag = SOURCE_LABEL[item.source]
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? 'Uncheck' : 'Check off'} ${item.name}`}
        onClick={() => onToggle(item)}
        className={cx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm text-white',
          done ? 'border-brand-600 bg-brand-600' : 'border-stone-300',
        )}
      >
        {done && '✓'}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onToggle(item)}>
        <div className={cx('truncate font-medium', done && 'text-stone-400 line-through')}>{item.name}</div>
        {!done && (
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
            {tag && <span className="text-amber-700">{tag}</span>}
            {item.note && <span>{item.note}</span>}
            {product && <span>Have: {units.length ? describeQuantity(product, units) : 'none'}</span>}
          </div>
        )}
      </button>
      <button
        type="button"
        aria-label={`Remove ${item.name}`}
        onClick={() => onRemove(item)}
        className="rounded-full px-2 py-1 text-stone-400 active:bg-stone-100"
      >
        ✕
      </button>
    </li>
  )
}

/** Free-text add with suggestions from things the household has had before. */
function AddItem({ kitchen }: { kitchen: Kitchen }) {
  const { household } = useApp()
  const toast = useToast()
  const [text, setText] = useState('')

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (q.length < 2) return []
    return kitchen.products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5)
  }, [text, kitchen.products])

  const add = async (product?: Product) => {
    const name = product?.name ?? text.trim()
    if (!name) return
    const exact = product ?? kitchen.products.find((p) => p.name.toLowerCase() === name.toLowerCase())
    const undo = await addToList(household.id, {
      name,
      category: exact?.category ?? categorize([], name),
      product_id: exact?.id ?? null,
    })
    setText('')
    toast({ message: `Added ${name}`, undo })
  }

  return (
    <div className="relative">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <input
          className={inputClass}
          placeholder="Add an item…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Add an item"
        />
        <Button type="submit" variant="primary" disabled={!text.trim()}>
          Add
        </Button>
      </form>
      {suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-stone-200">
          {suggestions.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left active:bg-stone-100"
                onClick={() => void add(p)}
              >
                <ProductThumb product={p} size={28} />
                <span className="truncate">{p.name}</span>
                {p.brand && <span className="truncate text-xs text-stone-500">{p.brand}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StaplesSheet({ open, onClose, kitchen }: { open: boolean; onClose: () => void; kitchen: Kitchen }) {
  const { household } = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')

  const staples = kitchen.products.filter((p) => p.staple).sort((a, b) => a.name.localeCompare(b.name))
  const query = q.trim().toLowerCase()
  const candidates = query
    ? kitchen.products.filter((p) => !p.staple && p.name.toLowerCase().includes(query)).slice(0, 8)
    : []
  const lowCount = staples.filter((p) => isLow(kitchen.unitsByProduct.get(p.id) ?? [])).length

  const toggle = async (p: Product) => {
    const r = await setStaple(p, !p.staple)
    toast({
      message: p.staple ? `${p.name} is no longer a staple` : `${p.name} is a staple${r.listed ? ' · added to list' : ''}`,
      undo: r.undo,
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Staples">
      <p className="mb-3 text-sm text-stone-600">
        Staples add themselves to the list when they run out or the last one is down to ¼.
      </p>
      <input
        className={`${inputClass} mb-2`}
        placeholder="Find something to keep stocked…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {candidates.length > 0 && (
        <ul className="mb-4 divide-y divide-stone-100 rounded-xl border border-stone-200">
          {candidates.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <ProductThumb product={p} size={32} />
              <span className="flex-1 truncate">{p.name}</span>
              <Button onClick={() => void toggle(p)}>☆ Add</Button>
            </li>
          ))}
        </ul>
      )}
      {staples.length ? (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {staples.map((p) => {
            const units = kitchen.unitsByProduct.get(p.id) ?? []
            const low = isLow(units)
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <ProductThumb product={p} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{p.name}</div>
                  <div className={cx('text-xs', low ? 'text-amber-700' : 'text-stone-500')}>
                    {units.length ? describeQuantity(p, units) : 'Out'}
                    {low && ' · low'}
                  </div>
                </div>
                <Button variant="ghost" aria-label={`Stop keeping ${p.name} stocked`} onClick={() => void toggle(p)}>
                  ★
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        !query && <p className="text-sm text-stone-500">No staples yet. Search above, or tap ☆ on any item in your kitchen.</p>
      )}
      {lowCount > 0 && (
        <Button
          variant="primary"
          className="mt-4 w-full"
          onClick={async () => {
            const r = await listLowStaples(household.id)
            toast({ message: r.count ? `Added ${r.count} to the list` : 'All low staples are already on the list', undo: r.undo })
          }}
        >
          Add low staples to list ({lowCount})
        </Button>
      )}
    </Sheet>
  )
}
