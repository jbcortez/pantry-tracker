import { useState } from 'react'
import { useApp } from '../lib/appContext'
import { defaultLocation, defaultTracking } from '../lib/categories'
import { estimateUseBy } from '../lib/shelfLife'
import { LOCATIONS, type Location, type ProductDraft, type Tracking } from '../lib/types'
import { Button, Field, inputClass, Segmented, Stepper } from './ui'

export interface NewProductInput {
  draft: ProductDraft
  location: Location
  count: number
  useBy: string | null
}

/** Confirm card for a product the household hasn't seen before. Everything is prefilled. */
export function ProductForm({
  initial,
  note,
  saving,
  onSave,
}: {
  initial: ProductDraft
  note?: string
  saving?: boolean
  onSave: (input: NewProductInput) => void
}) {
  const { categories } = useApp()
  const [draft, setDraft] = useState(initial)
  const [location, setLocation] = useState<Location>(initial.default_location)
  const [count, setCount] = useState(1)
  const [useBy, setUseBy] = useState(() => estimateUseBy(initial.category, initial.default_location, initial.name))
  // Keep re-estimating until the person types their own date.
  const [useByTouched, setUseByTouched] = useState(false)
  // Likewise, location and tracking follow the category until changed by hand.
  const [locationTouched, setLocationTouched] = useState(false)
  const [trackingTouched, setTrackingTouched] = useState(false)

  const update = (patch: Partial<ProductDraft>, nextLocation = location) => {
    const next = { ...draft, ...patch }
    let loc = nextLocation
    if (!locationTouched && (patch.category || patch.name !== undefined)) {
      loc = defaultLocation(next.category, next.name)
      setLocation(loc)
    }
    if (!trackingTouched && (patch.category || patch.name !== undefined)) {
      next.tracking = defaultTracking(next.category, next.name)
    }
    setDraft(next)
    if (!useByTouched) setUseBy(estimateUseBy(next.category, loc, next.name))
  }

  const changeLocation = (loc: Location) => {
    setLocationTouched(true)
    setLocation(loc)
    if (!useByTouched) setUseBy(estimateUseBy(draft.category, loc, draft.name))
  }

  const canSave = draft.name.trim().length > 0 && !saving

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave)
          onSave({
            draft: { ...draft, name: draft.name.trim(), default_location: location },
            location,
            count,
            useBy: useBy || null,
          })
      }}
    >
      {note && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>}
      <div className="flex gap-3">
        {draft.image_url && (
          <img src={draft.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-contain ring-1 ring-stone-200" />
        )}
        <div className="flex-1 space-y-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={draft.name}
              autoFocus={!draft.name}
              placeholder="e.g. Black beans"
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand">
          <input className={inputClass} value={draft.brand ?? ''} onChange={(e) => update({ brand: e.target.value || null })} />
        </Field>
        <Field label="Size">
          <input
            className={inputClass}
            value={draft.package_size ?? ''}
            placeholder="15 oz"
            onChange={(e) => update({ package_size: e.target.value || null })}
          />
        </Field>
      </div>
      <Field label="Category">
        <select className={inputClass} value={draft.category} onChange={(e) => update({ category: e.target.value })}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Where does it go?" group>
        <Segmented
          value={location}
          onChange={changeLocation}
          options={LOCATIONS.map((l) => ({ value: l.id, label: l.label }))}
        />
      </Field>
      <Field
        group
        label="How do you use it up?"
        hint={draft.tracking === 'count' ? 'One at a time, like cans or onions.' : 'A bit at a time, like flour or olive oil.'}
      >
        <Segmented<Tracking>
          value={draft.tracking}
          onChange={(t) => {
            setTrackingTouched(true)
            setDraft({ ...draft, tracking: t })
          }}
          options={[
            { value: 'count', label: 'Whole items' },
            { value: 'level', label: 'A bit at a time' },
          ]}
        />
      </Field>
      <div className="flex items-end justify-between gap-3">
        <Field label="Use by (estimated)">
          <input
            type="date"
            className={inputClass}
            value={useBy}
            onChange={(e) => {
              setUseByTouched(true)
              setUseBy(e.target.value)
            }}
          />
        </Field>
        <Field label="How many" group>
          <Stepper value={count} onChange={setCount} min={1} />
        </Field>
      </div>
      {/* Sticky so the one tap you need is always on screen. */}
      <div className="sticky bottom-0 -mx-5 -mb-6 bg-white px-5 pt-2 pb-4">
        <Button type="submit" variant="primary" big className="w-full" disabled={!canSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
