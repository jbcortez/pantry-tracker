import { type ReactNode, useState } from 'react'
import { Button, Field, inputClass } from '../components/ui'
import { createHousehold, joinHousehold, parseInviteCode } from '../lib/household'
import { supabase } from '../lib/supabase'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="safe-top mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-5xl">🥫</div>
        <h1 className="mt-2 text-2xl font-bold">Pantry</h1>
        <p className="text-stone-600">Know what’s in your kitchen.</p>
      </div>
      {children}
    </div>
  )
}

function errorText(err: unknown): string {
  return err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Something went wrong'
}

/**
 * Email sign-in. The email has both a link and a 6-digit code; the code matters on iPhone,
 * where an app installed to the home screen doesn't share a login with Safari.
 */
export function SignIn({ hasInvite }: { hasInvite: boolean }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  const verify = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(error.message)
    // On success, onAuthStateChange in App takes over.
  }

  return (
    <Shell>
      {hasInvite && (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-center text-sm text-brand-700">
          You’ve been invited to a kitchen. Sign in to join.
        </p>
      )}
      {!sent ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <Field label="Your email">
            <input
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Button type="submit" variant="primary" big className="w-full" disabled={busy || !email.includes('@')}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </Button>
          <p className="text-center text-xs text-stone-500">No password needed.</p>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          <p className="text-center text-sm text-stone-600">
            Check <b>{email}</b>. Enter the code from the email, or tap the link in it.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="123456"
          />
          <Button type="submit" variant="primary" big className="w-full" disabled={busy || code.length < 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </form>
      )}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </Shell>
  )
}

/** First run after sign-in: start a household or join one. */
export function Onboarding({ email, onDone }: { email: string | null; onDone: () => void }) {
  const [displayName, setDisplayName] = useState(email?.split('@')[0] ?? '')
  const [householdName, setHouseholdName] = useState('Our Kitchen')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onDone()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <Field label="Your name">
        <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <form
        className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => createHousehold(householdName, displayName))
        }}
      >
        <h2 className="font-semibold">Start a new kitchen</h2>
        <input className={inputClass} value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          Create
        </Button>
      </form>
      <form
        className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => joinHousehold(parseInviteCode(invite), displayName))
        }}
      >
        <h2 className="font-semibold">Join someone’s kitchen</h2>
        <input
          className={inputClass}
          placeholder="Paste invite link"
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={busy || !invite.trim()}>
          Join
        </Button>
      </form>
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </Shell>
  )
}
