import { useMemo, useRef, useState } from 'react'
import { ProductThumb } from '../components/ItemBits'
import { ProductForm, type NewProductInput } from '../components/ProductForm'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { Scanner } from '../components/Scanner'
import { useToast } from '../components/Toast'
import { Button, inputClass, Segmented, Sheet } from '../components/ui'
import { consume, createProduct, liveUnitsOf, putAway, type Result, type UseChoice } from '../lib/actions'
import { useApp } from '../lib/appContext'
import { describeQuantity, levelLabel, LEVELS, summarize } from '../lib/inventory'
import { findKnownProduct, lookupBarcode, normalizeBarcode } from '../lib/lookup'
import type { Product, ProductDraft } from '../lib/types'
import { soonestFirst, useKitchen } from '../lib/useKitchen'

type Mode = 'away' | 'cook'

type SheetState =
  | { kind: 'new'; loading: true }
  | { kind: 'new'; loading: false; draft: ProductDraft; note?: string }
  | { kind: 'level'; product: Product }
  | { kind: 'missing'; code: string | null; product?: Product }
  | { kind: 'quick' }
  | { kind: 'type' }

const MODE_KEY = 'pantry.scanMode'

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'cook' ? 'cook' : 'away'
  } catch {
    return 'away'
  }
}

export function Scan() {
  const { household } = useApp()
  const kitchen = useKitchen(household.id)
  const toast = useToast()
  const [mode, setModeState] = useState<Mode>(loadMode)
  const [sheet, setSheetState] = useState<SheetState | null>(null)
  // Refs so scanner callbacks see the latest state, not the render they were created in.
  const sheetRef = useRef<SheetState | null>(null)
  const busy = useRef(false)
  const setSheet = (s: SheetState | null) => {
    sheetRef.current = s
    setSheetState(s)
  }
  const [saving, setSaving] = useState(false)
  const [log, setLog] = useState<{ id: number; text: string }[]>([])

  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // not persisted; fine
    }
  }

  const record = (text: string) => setLog((l) => [{ id: Date.now() + Math.random(), text }, ...l].slice(0, 8))

  const announceAdd = (product: Product, r: Result, count = 1) => {
    const text = `Added ${count > 1 ? `${count} × ` : ''}${product.name} · ${r.remaining} on hand`
    toast({ message: text, undo: r.undo })
    record(`＋ ${text}`)
  }

  const announceUse = (product: Product, r: Result, verb: string) => {
    const tail = r.remaining ? `${r.remaining} left` : 'all gone'
    const text = `${verb} ${product.name} · ${tail}`
    toast({ message: text, undo: r.undo, tone: r.remaining ? 'ok' : 'warn' })
    record(`－ ${text}`)
  }

  const startNewProduct = async (code: string) => {
    setSheet({ kind: 'new', loading: true })
    const result = await lookupBarcode(household.id, code)
    if (result.kind === 'known') {
      // Someone else added it moments ago.
      setSheet(null)
      announceAdd(result.product, await putAway(result.product))
      return
    }
    const note =
      result.kind === 'unknown'
        ? result.offline
          ? 'You’re offline, so this barcode couldn’t be looked up. Enter the details once and it’s remembered.'
          : 'This barcode isn’t in any product database. Enter the details once and it’s remembered for everyone.'
        : undefined
    setSheet({ kind: 'new', loading: false, draft: result.draft, note })
  }

  const useUp = async (product: Product) => {
    const units = await liveUnitsOf(product.id)
    if (!units.length) {
      setSheet({ kind: 'missing', code: product.barcode, product })
    } else if (product.tracking === 'count') {
      announceUse(product, await consume(product, { kind: 'one' }), 'Used 1')
    } else {
      setSheet({ kind: 'level', product })
    }
  }

  const onDetect = async (raw: string) => {
    if (sheetRef.current || busy.current) return
    busy.current = true
    try {
      const code = normalizeBarcode(raw)
      const known = await findKnownProduct(household.id, code)
      if (mode === 'away') {
        if (known) announceAdd(known, await putAway(known))
        else await startNewProduct(code)
      } else if (known) {
        await useUp(known)
      } else {
        setSheet({ kind: 'missing', code })
      }
    } finally {
      busy.current = false
    }
  }

  const saveNew = async (input: NewProductInput) => {
    setSaving(true)
    try {
      const { product, ...r } = await createProduct(household.id, input.draft, input)
      setSheet(null)
      announceAdd(product, r, input.count)
    } finally {
      setSaving(false)
    }
  }

  const chooseLevel = async (product: Product, choice: UseChoice) => {
    setSheet(null)
    const verb = choice.kind === 'one' ? 'Finished' : choice.kind === 'openNew' ? 'Opened new' : `${levelLabel(choice.level)} left of`
    announceUse(product, await consume(product, choice), verb)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative">
        <Scanner paused={!!sheet} onDetect={(c) => void onDetect(c)} />
        <div className="safe-top absolute inset-x-0 top-0 p-3">
          <Segmented
            className="bg-black/60 backdrop-blur [&_button[aria-selected=false]]:text-white"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'away', label: '🛒 Putting Away' },
              { value: 'cook', label: '🍳 Cooking' },
            ]}
          />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-center text-sm text-stone-600">
          {mode === 'away'
            ? 'Scan each item as you put it away. Known items are added instantly.'
            : 'Scan what you use. Cans and other whole items are removed instantly.'}
        </p>

        {mode === 'away' ? (
          <div className="grid grid-cols-2 gap-3">
            <Button big variant="primary" onClick={() => setSheet({ kind: 'quick' })}>
              ＋ No barcode
            </Button>
            <Button big onClick={() => setSheet({ kind: 'type' })}>
              ⌨︎ Type barcode
            </Button>
          </div>
        ) : (
          <>
            <KitchenChips kitchen={kitchen} onPick={(p) => void useUp(p)} />
            <Button className="w-full" onClick={() => setSheet({ kind: 'type' })}>
              ⌨︎ Type barcode
            </Button>
          </>
        )}

        {log.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">This session</div>
            <ul className="space-y-1 text-sm text-stone-700">
              {log.map((l) => (
                <li key={l.id}>{l.text}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Sheet open={sheet?.kind === 'new'} onClose={() => setSheet(null)} title="New item">
        {sheet?.kind === 'new' &&
          (sheet.loading ? (
            <div className="py-10 text-center text-stone-500">Looking up barcode…</div>
          ) : (
            <ProductForm initial={sheet.draft} note={sheet.note} saving={saving} onSave={(i) => void saveNew(i)} />
          ))}
      </Sheet>

      <Sheet open={sheet?.kind === 'level'} onClose={() => setSheet(null)} title="How much did you use?">
        {sheet?.kind === 'level' && (
          <LevelChoices product={sheet.product} kitchen={kitchen} onChoose={(c) => void chooseLevel(sheet.product, c)} />
        )}
      </Sheet>

      <Sheet open={sheet?.kind === 'missing'} onClose={() => setSheet(null)} title="Not in your kitchen">
        {sheet?.kind === 'missing' && (
          <div className="space-y-4">
            <p className="text-stone-600">
              {sheet.product ? `${sheet.product.name} isn’t in the inventory right now.` : 'This item isn’t in the inventory.'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button big onClick={() => setSheet(null)}>
                Ignore
              </Button>
              <Button
                big
                variant="primary"
                onClick={async () => {
                  if (sheet.product) {
                    setSheet(null)
                    announceAdd(sheet.product, await putAway(sheet.product))
                  } else if (sheet.code) {
                    await startNewProduct(sheet.code)
                  }
                }}
              >
                Add it
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <QuickAddSheet
        open={sheet?.kind === 'quick'}
        onClose={() => setSheet(null)}
        onAdded={announceAdd}
        onCustom={(draft) => setSheet({ kind: 'new', loading: false, draft })}
      />

      <Sheet open={sheet?.kind === 'type'} onClose={() => setSheet(null)} title="Type the barcode">
        <TypeBarcode
          onSubmit={(code) => {
            setSheet(null)
            void onDetect(code)
          }}
        />
      </Sheet>
    </div>
  )
}

function LevelChoices({
  product,
  kitchen,
  onChoose,
}: {
  product: Product
  kitchen: ReturnType<typeof useKitchen>
  onChoose: (c: UseChoice) => void
}) {
  const [some, setSome] = useState(false)
  const units = kitchen.unitsByProduct.get(product.id) ?? []
  const s = summarize(units)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <ProductThumb product={product} />
        <div>
          <div className="font-semibold">{product.name}</div>
          <div className="text-sm text-stone-500">On hand: {describeQuantity(product, units)}</div>
        </div>
      </div>
      {!some ? (
        <div className="grid gap-3">
          <Button big variant="primary" onClick={() => onChoose({ kind: 'one' })}>
            Used it all
          </Button>
          <Button big onClick={() => setSome(true)}>
            Used some →
          </Button>
          {s.unopened > 0 && (
            <Button big onClick={() => onChoose({ kind: 'openNew' })}>
              {s.openLevel != null ? 'Finished it, opened a new one' : 'Opened a new one'}
            </Button>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-2 text-sm text-stone-600">How much is left?</p>
          <div className="grid grid-cols-3 gap-3">
            {LEVELS.filter((l) => l < 1).map((l) => (
              <Button key={l} big onClick={() => onChoose({ kind: 'left', level: l })}>
                {levelLabel(l)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** "In your kitchen" chips for things without a barcode, plus a search across everything. */
function KitchenChips({ kitchen, onPick }: { kitchen: ReturnType<typeof useKitchen>; onPick: (p: Product) => void }) {
  const [q, setQ] = useState('')
  const chips = useMemo(() => {
    const query = q.trim().toLowerCase()
    const groups = soonestFirst(kitchen.groups).filter((g) =>
      query
        ? g.product.name.toLowerCase().includes(query) || g.product.brand?.toLowerCase().includes(query)
        : !g.product.barcode || g.location === 'fridge',
    )
    const seen = new Set<string>()
    return groups.filter((g) => !seen.has(g.product.id) && seen.add(g.product.id)).slice(0, 24)
  }, [kitchen.groups, q])

  return (
    <div>
      <div className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">In your kitchen</div>
      <input
        className={`${inputClass} mb-2`}
        placeholder="Search anything…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {chips.length ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((g) => (
            <button
              key={g.product.id}
              type="button"
              onClick={() => onPick(g.product)}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm active:bg-stone-100"
            >
              {g.product.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-500">{q ? 'Nothing matches.' : 'Fridge and produce items will show up here.'}</p>
      )}
    </div>
  )
}

function TypeBarcode({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('')
  const valid = /^\d{6,14}$/.test(code)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit(code)
      }}
    >
      <input
        className={inputClass}
        inputMode="numeric"
        autoFocus
        placeholder="Numbers under the barcode"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      <Button type="submit" variant="primary" big className="w-full" disabled={!valid}>
        Look up
      </Button>
    </form>
  )
}
