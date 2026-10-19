import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { recipeMeta, RecipeSheet } from '../components/RecipeSheet'
import { SyncBadge } from '../components/SyncBadge'
import { useToast } from '../components/Toast'
import { cx } from '../components/ui'
import { useApp } from '../lib/appContext'
import { urgency } from '../lib/dates'
import { db } from '../lib/db'
import { matchRecipe, missing } from '../lib/recipes'
import type { Recipe } from '../lib/types'
import { type Kitchen, useKitchen } from '../lib/useKitchen'

/** Things to say to Claude once the Pantry connector is added. */
const PROMPTS = [
  'Check my pantry and suggest 4 dinners that use what’s expiring first. Save the ones I pick to my recipe box.',
  'What can I make in 30 minutes with what’s in my fridge?',
  'Save this recipe to my pantry and add anything I’m missing to the shopping list: ',
  'Plan 3 lunches for this week from my pantry and add what I need to the shopping list.',
]

export function Recipes() {
  const { household, cloud } = useApp()
  const kitchen = useKitchen(household.id)
  const [open, setOpen] = useState<Recipe | null>(null)

  const saved = useLiveQuery(
    () =>
      db.recipes
        .where('household_id')
        .equals(household.id)
        .filter((r) => !r.deleted_at)
        .toArray(),
    [household.id],
  )

  return (
    <div className="mx-auto max-w-lg pb-6">
      <header className="safe-top flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <SyncBadge />
      </header>

      <AskClaude cloud={cloud} />

      <RecipeBox saved={saved ?? []} kitchen={kitchen} onOpen={setOpen} />

      <RecipeSheet recipe={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function AskClaude({ cloud }: { cloud: boolean }) {
  const toast = useToast()
  return (
    <section className="mx-4 mb-5 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <div>
        <h2 className="text-lg font-semibold">Ask Claude what to make</h2>
        <p className="text-sm text-stone-600">
          {cloud
            ? 'With the Pantry connector, Claude can see your kitchen and save recipes here. Set it up under Settings → Claude, then try:'
            : 'Turn on sync to connect Claude to your kitchen (see docs/SETUP.md).'}
        </p>
      </div>
      {cloud && (
        <ul className="space-y-2">
          {PROMPTS.map((p) => (
            <li key={p}>
              <button
                type="button"
                className="w-full rounded-xl bg-stone-100 px-3 py-2 text-left text-sm text-stone-800 active:bg-stone-200"
                onClick={async () => {
                  await navigator.clipboard.writeText(p)
                  toast({ message: 'Copied. Paste it into Claude' })
                }}
              >
                “{p.trim()}{p.endsWith(': ') ? ' <link>' : ''}”
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RecipeCard({ recipe, kitchen, onClick }: { recipe: Recipe; kitchen: Kitchen; onClick: () => void }) {
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
        <p className="mt-1.5 text-xs text-amber-700">Uses up: {usesSoon.map((m) => m.product!.name).join(', ')}</p>
      )}
    </button>
  )
}

function RecipeBox({ saved, kitchen, onOpen }: { saved: Recipe[]; kitchen: Kitchen; onOpen: (r: Recipe) => void }) {
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
      <h2 className="mb-2 font-semibold">Recipe box</h2>
      {!saved.length && (
        <p className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm text-stone-500">
          Recipes Claude saves for you show up here, sorted by what you can make right now.
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
