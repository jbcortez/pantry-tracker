import { addMissingToList, deleteRecipe } from '../lib/actions'
import { useApp } from '../lib/appContext'
import { useCooking } from '../lib/cooking'
import { ingredientLine, matchRecipe, missing, type IngredientState } from '../lib/recipes'
import type { Recipe, RecipeDraft } from '../lib/types'
import { useKitchen } from '../lib/useKitchen'
import { useToast } from './Toast'
import { Button, cx, Sheet } from './ui'

const MARK: Record<IngredientState, { icon: string; className: string; label: string }> = {
  have: { icon: '✓', className: 'bg-brand-50 text-brand-700', label: 'Have' },
  low: { icon: '!', className: 'bg-amber-100 text-amber-800', label: 'Running low' },
  missing: { icon: '✕', className: 'bg-red-50 text-red-600', label: 'Need to buy' },
  staple: { icon: '·', className: 'bg-stone-100 text-stone-500', label: 'Pantry basic' },
}

export function recipeMeta(r: RecipeDraft): string {
  return [r.time_minutes ? `${r.time_minutes} min` : null, r.servings ? `serves ${r.servings}` : null]
    .filter(Boolean)
    .join(' · ')
}

/** Full view of a recipe from the recipe box. */
export function RecipeSheet({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  return (
    <Sheet open={!!recipe} onClose={onClose} title={recipe?.title}>
      {recipe && <RecipeDetails recipe={recipe} onClose={onClose} />}
    </Sheet>
  )
}

function RecipeDetails({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const { household } = useApp()
  const kitchen = useKitchen(household.id)
  const toast = useToast()
  const cooking = useCooking()
  const matched = matchRecipe(recipe, kitchen)
  const need = missing(matched)
  const url = recipe.source_url

  return (
    <div className="space-y-5">
      <div>
        {recipe.summary && <p className="text-stone-700">{recipe.summary}</p>}
        <p className="mt-1 text-sm text-stone-500">
          {recipeMeta(recipe)}
          {url && (
            <>
              {' · '}
              <a href={url} target="_blank" rel="noreferrer" className="underline">
                Original
              </a>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="primary"
          onClick={() => {
            onClose()
            cooking.start(recipe)
          }}
        >
          🍳 Cook this
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            onClose()
            toast({ message: 'Removed from recipe box', undo: await deleteRecipe(recipe) })
          }}
        >
          Remove
        </Button>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Ingredients</h3>
        <ul className="space-y-1.5">
          {matched.map((m, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                title={MARK[m.state].label}
                aria-label={MARK[m.state].label}
                className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold', MARK[m.state].className)}
              >
                {MARK[m.state].icon}
              </span>
              <span className="flex-1">
                <span className="font-medium">{ingredientLine(m.ingredient).lead}</span> {ingredientLine(m.ingredient).rest}
                {m.product && m.state !== 'missing' && m.product.name.toLowerCase() !== m.ingredient.name.toLowerCase() && (
                  <span className="text-xs text-stone-500"> — your {m.product.name}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {need.length > 0 && (
          <Button
            className="mt-3 w-full"
            onClick={async () => {
              const r = await addMissingToList(household.id, recipe.title, need)
              toast({
                message: r.count ? `Added ${r.count} to the shopping list` : 'Already on the list',
                undo: r.count ? r.undo : undefined,
              })
            }}
          >
            ＋ Add {need.length} missing to shopping list
          </Button>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Steps</h3>
        <ol className="list-decimal space-y-2 pl-5 text-stone-800">
          {recipe.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}
