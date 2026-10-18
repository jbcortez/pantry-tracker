import { useMemo, useState } from 'react'
import { ItemRow } from '../components/ItemBits'
import { ItemSheet } from '../components/ItemSheet'
import { SyncBadge } from '../components/SyncBadge'
import { inputClass, Segmented } from '../components/ui'
import { categoryOf, useApp } from '../lib/appContext'
import { urgency } from '../lib/dates'
import { LOCATIONS } from '../lib/types'
import { type Group, useKitchen } from '../lib/useKitchen'

type View = 'category' | 'location' | 'expiring'

interface Section {
  key: string
  title: string
  groups: Group[]
}

const byUseBy = (a: Group, b: Group) => (a.nextUseBy ?? '9999').localeCompare(b.nextUseBy ?? '9999')

export function Kitchen({ onScan }: { onScan: () => void }) {
  const { household, categories } = useApp()
  const kitchen = useKitchen(household.id)
  const [view, setView] = useState<View>('category')
  const [q, setQ] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Look the group up fresh each render so the sheet reflects live changes.
  const selected = kitchen.groups.find((g) => g.key === selectedKey) ?? null

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return kitchen.groups
    return kitchen.groups.filter(
      (g) =>
        g.product.name.toLowerCase().includes(query) ||
        g.product.brand?.toLowerCase().includes(query) ||
        categoryOf(categories, g.product.category).label.toLowerCase().includes(query),
    )
  }, [kitchen.groups, q, categories])

  const useSoon = useMemo(
    () => kitchen.groups.filter((g) => urgency(g.nextUseBy) !== 'ok').sort(byUseBy),
    [kitchen.groups],
  )

  const sections: Section[] = useMemo(() => {
    if (view === 'expiring') return [{ key: 'all', title: '', groups: [...filtered].sort(byUseBy) }]
    if (view === 'location') {
      return LOCATIONS.map((l) => ({
        key: l.id,
        title: `${l.icon} ${l.label}`,
        groups: filtered.filter((g) => g.location === l.id),
      })).filter((s) => s.groups.length)
    }
    return categories
      .map((c) => ({
        key: c.id,
        title: `${c.icon} ${c.label}`,
        groups: filtered.filter((g) => categoryOf(categories, g.product.category).id === c.id),
      }))
      .filter((s) => s.groups.length)
  }, [view, filtered, categories])

  return (
    <div className="mx-auto max-w-lg pb-6">
      <header className="safe-top sticky top-0 z-20 space-y-3 bg-[#f6f7f5]/95 px-4 pt-4 pb-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{household.name}</h1>
          <SyncBadge />
        </div>
        <input
          type="search"
          className={inputClass}
          placeholder="Search your kitchen…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'category', label: 'Category' },
            { value: 'location', label: 'Location' },
            { value: 'expiring', label: 'Expiring' },
          ]}
        />
      </header>

      {kitchen.ready && kitchen.groups.length === 0 && (
        <div className="px-6 py-16 text-center">
          <div className="text-5xl">🧺</div>
          <h2 className="mt-3 text-lg font-semibold">Your kitchen is empty</h2>
          <p className="mt-1 text-stone-600">Scan groceries as you put them away and they’ll show up here.</p>
          <button
            type="button"
            onClick={onScan}
            className="mt-5 rounded-xl bg-brand-600 px-5 py-3 font-medium text-white active:bg-brand-700"
          >
            Start scanning
          </button>
        </div>
      )}

      {!q && view !== 'expiring' && useSoon.length > 0 && (
        <section className="mx-4 mb-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
          <h2 className="px-4 pt-3 pb-1 text-sm font-semibold text-amber-900">⏰ Use soon</h2>
          <div className="divide-y divide-amber-100">
            {useSoon.map((g) => (
              <ItemRow key={g.key} group={g} showLocation onClick={() => setSelectedKey(g.key)} />
            ))}
          </div>
        </section>
      )}

      {sections.map((s) => (
        <section key={s.key} className="mx-4 mb-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70">
          {s.title && (
            <h2 className="px-4 pt-3 pb-1 text-sm font-semibold text-stone-600">
              {s.title} <span className="font-normal text-stone-400">· {s.groups.length}</span>
            </h2>
          )}
          <div className="divide-y divide-stone-100">
            {s.groups.map((g) => (
              <ItemRow key={g.key} group={g} showLocation={view !== 'location'} onClick={() => setSelectedKey(g.key)} />
            ))}
          </div>
        </section>
      ))}

      {q && !filtered.length && <p className="px-4 py-8 text-center text-stone-500">Nothing matches “{q}”.</p>}

      <ItemSheet group={selected} onClose={() => setSelectedKey(null)} />
    </div>
  )
}
