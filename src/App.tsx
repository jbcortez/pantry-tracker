import { useCallback, useEffect, useMemo, useState } from 'react'
import { ToastProvider } from './components/Toast'
import { cx } from './components/ui'
import { AppContext, type AppState } from './lib/appContext'
import { resolveCategories } from './lib/categories'
import { db } from './lib/db'
import {
  cachedHousehold,
  cacheHousehold,
  fetchMyHousehold,
  joinHousehold,
  LOCAL_HOUSEHOLD,
  takePendingJoin,
} from './lib/household'
import { supabase } from './lib/supabase'
import { startSync } from './lib/sync'
import type { Household } from './lib/types'
import { Kitchen } from './screens/Kitchen'
import { Scan } from './screens/Scan'
import { Settings } from './screens/Settings'
import { Onboarding, SignIn } from './screens/Welcome'

type Phase =
  | { kind: 'loading' }
  | { kind: 'signin' }
  | { kind: 'onboarding' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; household: Household }

function initialPhase(): Phase {
  const cached = cachedHousehold()
  if (!supabase) return { kind: 'ready', household: cached ?? LOCAL_HOUSEHOLD }
  // Open straight into the cached household so the app works offline; verify in the background.
  return cached ? { kind: 'ready', household: cached } : { kind: 'loading' }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [email, setEmail] = useState<string | null>(null)
  const [hasInvite] = useState(() => !!localStorage.getItem('pantry.pendingJoin'))

  const resolve = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.auth.getSession()
    const session = data.session
    if (!session) {
      // A network failure refreshing the session isn't a sign-out: stay in the cached household.
      if (error && cachedHousehold()) return
      cacheHousehold(null)
      setPhase({ kind: 'signin' })
      return
    }
    setEmail(session.user.email ?? null)
    try {
      let joined: string | null = null
      const pending = takePendingJoin()
      if (pending) {
        joined = await joinHousehold(pending, session.user.email?.split('@')[0] ?? null).catch((err) => {
          console.warn('Join failed', err)
          return null
        })
      }
      const h = await fetchMyHousehold(joined)
      if (!h) {
        setPhase({ kind: 'onboarding' })
        return
      }
      cacheHousehold(h)
      setPhase({ kind: 'ready', household: h })
    } catch (err) {
      const cached = cachedHousehold()
      if (cached) setPhase({ kind: 'ready', household: cached })
      else setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Couldn’t reach the server.' })
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Defer: calling Supabase from inside this callback can deadlock its auth lock.
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') setTimeout(() => void resolve(), 0)
      if (event === 'SIGNED_OUT') {
        cacheHousehold(null)
        setPhase({ kind: 'signin' })
      }
    })
    return () => data.subscription.unsubscribe()
  }, [resolve])

  const householdId = phase.kind === 'ready' ? phase.household.id : null

  useEffect(() => {
    if (!householdId) return
    return startSync(householdId, () => void resolve())
  }, [householdId, resolve])

  const setHousehold = useCallback((h: Household) => {
    cacheHousehold(h)
    setPhase({ kind: 'ready', household: h })
  }, [])

  const signOut = useCallback(async () => {
    // Don't leave the household's data on a shared device.
    await Promise.all([db.products.clear(), db.inventory_units.clear(), db.outbox.clear(), db.meta.clear()])
    cacheHousehold(null)
    await supabase?.auth.signOut()
    setPhase({ kind: 'signin' })
  }, [])

  const appState: AppState | null = useMemo(
    () =>
      phase.kind === 'ready'
        ? {
            household: phase.household,
            categories: resolveCategories(phase.household.categories),
            cloud: !!supabase,
            email,
            setHousehold,
            signOut,
          }
        : null,
    [phase, email, setHousehold, signOut],
  )

  if (phase.kind === 'loading') return <div className="flex h-full items-center justify-center text-stone-500">Loading…</div>
  if (phase.kind === 'signin') return <SignIn hasInvite={hasInvite} />
  if (phase.kind === 'onboarding') return <Onboarding email={email} onDone={() => void resolve()} />
  if (phase.kind === 'error')
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-stone-700">{phase.message}</p>
        <button type="button" className="rounded-xl bg-brand-600 px-4 py-2 text-white" onClick={() => void resolve()}>
          Try again
        </button>
      </div>
    )

  return (
    <AppContext.Provider value={appState}>
      <ToastProvider>
        <Main />
      </ToastProvider>
    </AppContext.Provider>
  )
}

type Tab = 'kitchen' | 'scan' | 'settings'

function Main() {
  const [tab, setTab] = useState<Tab>('kitchen')
  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto">
        {tab === 'kitchen' && <Kitchen onScan={() => setTab('scan')} />}
        {/* Mounted only while visible, so the camera turns off when you leave. */}
        {tab === 'scan' && <Scan />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="safe-bottom border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-lg items-end justify-around px-2 pt-1.5 pb-1">
          <TabButton active={tab === 'kitchen'} onClick={() => setTab('kitchen')} icon="🧺" label="Kitchen" />
          <button
            type="button"
            onClick={() => setTab('scan')}
            className={cx(
              '-mt-6 flex h-16 w-16 flex-col items-center justify-center rounded-full text-white shadow-lg ring-4 ring-[#f6f7f5]',
              tab === 'scan' ? 'bg-brand-700' : 'bg-brand-600',
            )}
            aria-label="Scan"
          >
            <span className="text-2xl leading-none">▦</span>
            <span className="text-[10px] font-semibold">Scan</span>
          </button>
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon="⚙️" label="Settings" />
        </div>
      </nav>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('flex w-20 flex-col items-center py-1 text-xs', active ? 'font-semibold text-brand-700' : 'text-stone-500')}
    >
      <span className={cx('text-xl', !active && 'opacity-60 grayscale')}>{icon}</span>
      {label}
    </button>
  )
}
