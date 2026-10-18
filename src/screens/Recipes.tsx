import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { recipeMeta, RecipeSheet } from '../components/RecipeSheet'
import { SyncBadge } from '../components/SyncBadge'
import { Button, cx, Field, inputClass, Segmented, Sheet, Stepper } from '../components/ui'
import { useApp } from '../lib/appContext'
import { urgency } from '../lib/dates'
import { db } from '../lib/db'
import { generateRecipes, importRecipe, inventoryForAI, matchRecipe, missing } from '../lib/recipes'
import type { Recipe, RecipeDraft } from '../lib/types'
import { type Kitchen, useKitchen } from '../lib/useKitchen'

const RESULTS_KEY = 'pantry.generatedRecipes'

function loadResults(): RecipeDraft[] {
  try {
    return JSON.parse(sessionStorage.getItem(RESULTS_KEY) ?? '[]') as RecipeDraft[]
  } catch {
    return []
  }
}

type Time = 'any' | '30' | '60'

type Open =
  | { kind: 'draft'; recipe: RecipeDraft; source: { kind: Recipe['source']; url?: string | null } }
  | { kind: 'saved'; recipe: Recipe }

export function Recipes() {
  const { household, categories } = useApp()
  const kitchen = useKitchen(household.id)
  const [results, setResultsState] = useState<RecipeDraft[]>(loadResults)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState<Time>('any')
  const [servings, setServings] = useState(2)
  const [cuisine, setCuisine] = useState('')
  const [useExpiring, setUseExpiring] = useState(true)
  const [open, setOpen] = useState<Open | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const saved = useLiveQuery(
    () =>
      db.recipes
        .where('household_id')
        .equals(household.id)
        .filter((r) => !r.deleted_at)
        .toArray(),
    [household.id],
  )

  const expiringCount = kitchen.groups.filter((g) => urgency(g.nextUseBy) !== 'ok').length

  const setResults = (r: RecipeDraft[]) => {
    setResultsState(r)
    try {
      sessionStorage.setItem(RESULTS_KEY, JSON.stringify(r))
    } catch {
      // not kept across reloads; fine
    }
  }

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const recipes = await generateRecipes(inventoryForAI(kitchen, categories), {
        maxMinutes: time === 'any' ? null : Number(time),
        servings,
        cuisine,
        useExpiring,
        notes: household.recipe_notes,
      })
      setResults(recipes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg pb-6">
      <header className="safe-top flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <SyncBadge />
      </header>

      <section className="mx-4 mb-5 space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
        <div>
          <h2 className="text-lg font-semibold">What can I make?</h2>
          <p className="text-sm text-stone-600">Ideas built from what’s in your kitchen right now.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time" group>
            <Segmented
              value={time}
              onChange={setTime}
              options={[
                { value: 'any', label: 'Any' },
                { value: '30', label: '30m' },
                { value: '60', label: '1h' },
              ]}
            />
          </Field>
          <Field label="Servings" group>
            <Stepper value={servings} onChange={setServings} min={1} />
          </Field>
        </div>
        <Field label="Cuisine or mood (optional)">
          <input
            className={inputClass}
            placeholder="e.g. Mexican, soup, quick lunch"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-600"
            checked={useExpiring}
            onChange={(e) => setUseExpiring(e.target.checked)}
          />
          <span>
            Use what’s expiring first
            {expiringCount > 0 && <span className="text-amber-700"> ({expiringCount} items)</span>}
          </span>
        </label>
        <Button variant="primary" big className="w-full" disabled={busy || !kitchen.groups.length} onClick={() => void generate()}>
          {busy ? 'Thinking up recipes…' : '✨ Suggest recipes'}
        </Button>
        {!kitchen.groups.length && kitchen.ready && (
          <p className="text-center text-sm text-stone-500">Add some food to your kitchen first.</p>
        )}
        {busy && <p className="text-center text-xs text-stone-500">This can take up to a minute.</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </section>

      {results.length > 0 && (
        <section className="mx-4 mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Suggestions</h2>
            <Button variant="ghost" onClick={() => setResults([])}>
              Clear
            </Button>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <RecipeCard
                key={`${r.title}-${i}`}
                recipe={r}
                kitchen={kitchen}
                onClick={() => setOpen({ kind: 'draft', recipe: r, source: { kind: 'ai' } })}
              />
            ))}
          </div>
        </section>
      )}

      <RecipeBox
        saved={saved ?? []}
        kitchen={kitchen}
        onOpen={(r) => setOpen({ kind: 'saved', recipe: r })}
        onImport={() => setImportOpen(true)}
      />

      <RecipeSheet
        recipe={open?.recipe ?? null}
        saved={open?.kind === 'saved' ? open.recipe : undefined}
        source={open?.kind === 'draft' ? open.source : undefined}
        onClose={() => setOpen(null)}
      />
      <ImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        kitchen={kitchen}
        onImported={(recipe, url) => {
          setImportOpen(false)
          setOpen({ kind: 'draft', recipe, source: { kind: 'url', url } })
        }}
      />
    </div>
  )
}

function RecipeCard({ recipe, kitchen, onClick }: { recipe: RecipeDraft; kitchen: Kitchen; onClick: () => void }) {
  const matched = matchRecipe(recipe, kitchen)
  const need = missing(matched)
  const usesSoon = matched.filter((m) => {
    const units = m.product ? kitchen.unitsByProduct.get(m.product.id) : undefined
    return m.state !== 'missing' && units?.some((u) => urgency(u.use_by) !== 'ok')
  })
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-stone-200/70 active:bg-stone-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{recipe.title}</div>
          <div className="text-xs text-stone-500">{recipeMeta(recipe)}</div>
        </div>
        <span
          className={cx(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            need.length ? 'bg-stone-100 text-stone-700' : 'bg-brand-50 text-brand-700',
          )}
        >
          {need.length ? `Need ${need.length}` : 'Ready'}
        </span>
      </div>
      {recipe.summary && <p className="mt-1.5 line-clamp-2 text-sm text-stone-600">{recipe.summary}</p>}
      {usesSoon.length > 0 && (
        <p className="mt-1.5 text-xs text-amber-700">
          Uses up: {usesSoon.map((m) => m.product!.name).join(', ')}
        </p>
      )}
    </button>
  )
}

function RecipeBox({
  saved,
  kitchen,
  onOpen,
  onImport,
}: {
  saved: Recipe[]
  kitchen: Kitchen
  onOpen: (r: Recipe) => void
  onImport: () => void
}) {
  const groups = useMemo(() => {
    const scored = saved
      .map((r) => ({ r, need: missing(matchRecipe(r, kitchen)).length }))
      .sort((a, b) => a.need - b.need || a.r.title.localeCompare(b.r.title))
    return [
      { title: 'Ready to make', items: scored.filter((s) => s.need === 0) },
      { title: 'Missing 1', items: scored.filter((s) => s.need === 1) },
      { title: 'Missing more', items: scored.filter((s) => s.need > 1) },
    ].filter((g) => g.items.length)
  }, [saved, kitchen])

  return (
    <section className="mx-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Recipe box</h2>
        <Button variant="ghost" onClick={onImport}>
          ＋ Import
        </Button>
      </div>
      {!saved.length && (
        <p className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm text-stone-500">
          Save suggestions you like, or import a recipe from a website. They’ll be sorted by what you can make right now.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.title} className="mb-4">
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase">
            {g.title} · {g.items.length}
          </h3>
          <div className="space-y-2">
            {g.items.map(({ r }) => (
              <RecipeCard key={r.id} recipe={r} kitchen={kitchen} onClick={() => onOpen(r)} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function ImportSheet({
  open,
  onClose,
  kitchen,
  onImported,
}: {
  open: boolean
  onClose: () => void
  kitchen: Kitchen
  onImported: (recipe: RecipeDraft, url: string | null) => void
}) {
  const { categories } = useApp()
  const [mode, setMode] = useState<'url' | 'text'>('url')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const source = mode === 'url' ? { url: value.trim() } : { text: value.trim() }
      const recipe = await importRecipe(inventoryForAI(kitchen, categories), source)
      setValue('')
      onImported(recipe, mode === 'url' ? value.trim() : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Import a recipe">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) void submit()
        }}
      >
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m)
            setError(null)
          }}
          options={[
            { value: 'url', label: 'From a link' },
            { value: 'text', label: 'Paste text' },
          ]}
        />
        {mode === 'url' ? (
          <input
            type="url"
            inputMode="url"
            className={inputClass}
            placeholder="https://…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Recipe link"
          />
        ) : (
          <textarea
            className={`${inputClass} min-h-40`}
            placeholder="Paste the ingredients and steps"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Recipe text"
          />
        )}
        <Button type="submit" variant="primary" big className="w-full" disabled={busy || !value.trim()}>
          {busy ? 'Reading recipe…' : 'Import'}
        </Button>
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </form>
    </Sheet>
  )
}
