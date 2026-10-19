import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../lib/appContext'
import { type AgentKey, connectorUrl, createAgentKey, listAgentKeys, revokeAgentKey } from '../lib/household'
import { useToast } from './Toast'
import { Button, inputClass } from './ui'

function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const toast = useToast()
  return (
    <div>
      <div className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{label}</div>
      {hint && <p className="mb-1 text-xs text-stone-600">{hint}</p>}
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-stone-100 px-2 py-2 text-xs">{value}</code>
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            toast({ message: 'Copied' })
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  )
}

/** Settings card: keys that let Claude read the kitchen and save recipes. */
export function ClaudeConnect() {
  const { household, cloud } = useApp()
  const toast = useToast()
  const [keys, setKeys] = useState<AgentKey[]>([])
  const [label, setLabel] = useState('Claude')
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    if (cloud) listAgentKeys(household.id).then(setKeys).catch(() => {})
  }, [cloud, household.id])
  useEffect(refresh, [refresh])

  if (!cloud) {
    return (
      <p className="text-sm text-stone-600">
        Claude can read your kitchen once sync is turned on (see <code>docs/SETUP.md</code>), since in device-only mode
        everything lives in this browser.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Let Claude read what’s in your kitchen, save recipes to your recipe box and add to the shopping list. It can’t
        change or remove anything else.
      </p>

      {fresh ? (
        <div className="space-y-3 rounded-xl border border-brand-500/40 bg-brand-50/50 p-3">
          <p className="text-sm font-medium text-brand-700">Key created. Copy what you need now: it won’t be shown again.</p>
          <CopyRow
            label="Claude app (phone, desktop, web)"
            hint="In Claude: Settings → Connectors → Add custom connector. Name it Pantry and paste this URL."
            value={connectorUrl(fresh)}
          />
          <CopyRow label="Claude Code" value={`claude mcp add --transport http pantry "${connectorUrl(fresh)}"`} />
          <CopyRow label="pantry CLI" value={`pantry setup ${location.origin} ${fresh}`} />
          <Button className="w-full" onClick={() => setFresh(null)}>
            Done
          </Button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              setFresh(await createAgentKey(household.id, label))
              refresh()
            } catch {
              toast({ message: 'Couldn’t create a key — are you online?', tone: 'warn' })
            } finally {
              setBusy(false)
            }
          }}
        >
          <input
            className={inputClass}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Key name"
            placeholder="e.g. Justin’s Claude"
          />
          <Button type="submit" variant="primary" disabled={busy} className="whitespace-nowrap">
            Create key
          </Button>
        </form>
      )}

      {keys.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{k.label}</div>
                <div className="text-xs text-stone-500">
                  {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Not used yet'}
                </div>
              </div>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirm(`Disconnect "${k.label}"? Anything using this key will stop working.`)) return
                  await revokeAgentKey(k.id)
                  refresh()
                  toast({ message: 'Key revoked' })
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
