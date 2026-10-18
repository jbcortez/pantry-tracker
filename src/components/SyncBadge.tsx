import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useApp } from '../lib/appContext'
import { db } from '../lib/db'

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function SyncBadge() {
  const { cloud } = useApp()
  const online = useOnline()
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0

  if (!cloud) return <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs text-stone-600">This device only</span>
  if (!online)
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
        Offline{pending ? ` · ${pending} to sync` : ''}
      </span>
    )
  if (pending) return <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs text-stone-600">Syncing…</span>
  return <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">✓ Synced</span>
}
