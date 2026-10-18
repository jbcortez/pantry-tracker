import { type ReactNode, useEffect, useState } from 'react'
import { SyncBadge } from '../components/SyncBadge'
import { useToast } from '../components/Toast'
import { Button, inputClass } from '../components/ui'
import { useApp } from '../lib/appContext'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import { fetchMembers, inviteLink, updateHousehold } from '../lib/household'
import type { CategoryDef, Household } from '../lib/types'

export function Settings() {
  const { household, categories, cloud, email, setHousehold, signOut } = useApp()
  const toast = useToast()
  const [name, setName] = useState(household.name)
  const [members, setMembers] = useState<{ user_id: string; display_name: string | null }[]>([])

  useEffect(() => {
    if (cloud) fetchMembers(household.id).then(setMembers).catch(() => {})
  }, [cloud, household.id])

  const save = async (patch: Partial<Pick<Household, 'name' | 'categories' | 'recipe_notes'>>) => {
    const next = { ...household, ...patch }
    setHousehold(next)
    try {
      await updateHousehold(household.id, patch)
    } catch {
      toast({ message: 'Couldn’t save — are you online?', tone: 'warn' })
    }
  }

  const share = async () => {
    const link = inviteLink(household)
    const text = `Join our kitchen on Pantry: ${link}`
    if (navigator.share) {
      await navigator.share({ title: 'Join our kitchen', text, url: link }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(link)
      toast({ message: 'Invite link copied' })
    }
  }

  return (
    <div className="safe-top mx-auto max-w-lg space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <SyncBadge />
      </div>

      <Card title="Household">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && name.trim() !== household.name) {
              void save({ name: name.trim() })
              toast({ message: 'Renamed' })
            }
          }}
        >
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} aria-label="Household name" />
          <Button type="submit">Save</Button>
        </form>
        {cloud ? (
          <>
            <div className="mt-4 text-sm text-stone-600">
              Members: {members.map((m) => m.display_name || 'Someone').join(', ') || '…'}
            </div>
            <Button variant="primary" className="mt-3 w-full" onClick={() => void share()}>
              Invite someone
            </Button>
            <p className="mt-2 text-xs text-stone-500">
              Anyone with the invite link can join after signing in with their email.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-stone-600">
            Running in device-only mode: nothing is shared or backed up. See <code>docs/SETUP.md</code> to turn on sync.
          </p>
        )}
      </Card>

      <CategoriesCard categories={categories} onSave={(c) => void save({ categories: c })} />

      <RecipeNotesCard
        notes={household.recipe_notes ?? ''}
        onSave={(recipe_notes) => {
          void save({ recipe_notes })
          toast({ message: 'Saved — recipes will follow this' })
        }}
      />

      <Card title="Install on your phone">
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
          <li>
            <b>iPhone:</b> open this site in Safari, tap the Share button, then <i>Add to Home Screen</i>.
          </li>
          <li>
            <b>Android:</b> in Chrome, tap ⋮ then <i>Install app</i> (or <i>Add to Home screen</i>).
          </li>
        </ul>
      </Card>

      {cloud && (
        <Card title="Account">
          <p className="mb-3 text-sm text-stone-600">Signed in as {email}</p>
          <Button variant="danger" className="w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Card>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function RecipeNotesCard({ notes, onSave }: { notes: string; onSave: (n: string) => void }) {
  const [value, setValue] = useState(notes)
  useEffect(() => setValue(notes), [notes])
  return (
    <Card title="Recipe preferences">
      <textarea
        className={`${inputClass} min-h-20`}
        placeholder="e.g. No pork. Kids don’t like spicy food. Prefer one-pot meals."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Recipe preferences"
      />
      <p className="mt-1 text-xs text-stone-500">Dietary rules and dislikes for everyone in the household.</p>
      {value.trim() !== notes.trim() && (
        <Button variant="primary" className="mt-3 w-full" onClick={() => onSave(value.trim())}>
          Save preferences
        </Button>
      )}
    </Card>
  )
}

function CategoriesCard({ categories, onSave }: { categories: CategoryDef[]; onSave: (c: CategoryDef[]) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(categories)
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => setDraft(categories), [categories])

  if (!open) {
    return (
      <Card title="Categories">
        <p className="mb-3 text-sm text-stone-600">{categories.map((c) => c.label).join(' · ')}</p>
        <Button className="w-full" onClick={() => setOpen(true)}>
          Rename or add categories
        </Button>
      </Card>
    )
  }

  return (
    <Card title="Categories">
      <div className="space-y-2">
        {draft.map((c, i) => (
          <div key={c.id} className="flex gap-2">
            <input
              className={`${inputClass} w-14 text-center`}
              value={c.icon}
              aria-label="Icon"
              onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, icon: e.target.value } : d)))}
            />
            <input
              className={inputClass}
              value={c.label}
              aria-label="Name"
              onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, label: e.target.value } : d)))}
            />
          </div>
        ))}
        <form
          className="flex gap-2 pt-2"
          onSubmit={(e) => {
            e.preventDefault()
            const label = newLabel.trim()
            if (!label) return
            const id = `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`
            const other = draft.findIndex((d) => d.id === 'other')
            setDraft([...draft.slice(0, other), { id, label, icon: '🏷️' }, ...draft.slice(other)])
            setNewLabel('')
          }}
        >
          <input
            className={inputClass}
            placeholder="New category"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <Button type="submit">Add</Button>
        </form>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          onClick={() => {
            setDraft(categories)
            setOpen(false)
          }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            const cleaned = draft.map((d) => ({ ...d, label: d.label.trim() || DEFAULT_CATEGORIES.find((x) => x.id === d.id)?.label || 'Untitled' }))
            onSave(cleaned)
            setOpen(false)
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  )
}
