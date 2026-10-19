import { type ReactNode, useState } from 'react'
import { Button, Field, inputClass, Segmented } from '../components/ui'
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

const MIN_PASSWORD = 8

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.'
  if (/already registered|already been registered/i.test(message))
    return 'That email already has an account. Sign in instead, or use “Forgot password?”.'
  if (/rate limit/i.test(message)) return 'Too many emails sent recently. Try again in an hour, or sign in with your password.'
  if (/email not confirmed/i.test(message)) return 'This account isn’t confirmed yet. Check your email for the confirmation link.'
  return message
}

/** Email + password. "Forgot password?" falls back to a one-time code by email. */
export function SignIn({ hasInvite }: { hasInvite: boolean }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'code'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error } = await fn()
    setBusy(false)
    if (error) setError(friendlyAuthError(error.message))
    // On success, onAuthStateChange in App takes over.
  }

  const submit = () =>
    run(async () => {
      if (mode === 'signin') return supabase!.auth.signInWithPassword({ email: email.trim(), password })
      const { data, error } = await supabase!.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: location.origin },
      })
      if (!error && !data.session) {
        setNotice('Check your email to confirm your account, then sign in here.')
      }
      return { error }
    })

  if (mode === 'code') {
    return (
      <Shell>
        <CodeSignIn initialEmail={email} onBack={() => setMode('signin')} />
      </Shell>
    )
  }

  const valid = email.includes('@') && password.length >= (mode === 'signup' ? MIN_PASSWORD : 1)

  return (
    <Shell>
      {hasInvite && (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-center text-sm text-brand-700">
          You’ve been invited to a kitchen. Sign in or create an account to join.
        </p>
      )}
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m)
          setError(null)
          setNotice(null)
        }}
        options={[
          { value: 'signin', label: 'Sign in' },
          { value: 'signup', label: 'Create account' },
        ]}
      />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void submit()
        }}
      >
        <Field label="Email">
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
        <Field
          label="Password"
          hint={mode === 'signup' ? `At least ${MIN_PASSWORD} characters.` : undefined}
        >
          <input
            type="password"
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" big className="w-full" disabled={busy || !valid}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
      {mode === 'signin' && (
        <Button variant="ghost" className="w-full" onClick={() => setMode('code')}>
          Forgot password? Sign in with an emailed code
        </Button>
      )}
      {notice && <p className="text-center text-sm text-brand-700">{notice}</p>}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </Shell>
  )
}

/**
 * One-time code by email, for a forgotten password (then set a new one in Settings).
 * The code matters on iPhone, where an app installed to the home screen doesn't share a
 * login with Safari, so the email's link would sign in the wrong place.
 */
function CodeSignIn({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin, shouldCreateUser: false },
    })
    setBusy(false)
    if (error) setError(friendlyAuthError(error.message))
    else setSent(true)
  }

  const verify = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(friendlyAuthError(error.message))
  }

  return (
    <>
      {!sent ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <p className="text-center text-sm text-stone-600">
            We’ll email you a code to sign in. Then set a new password in Settings.
          </p>
          <Field label="Your email">
            <input
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" big className="w-full" disabled={busy || !email.includes('@')}>
            {busy ? 'Sending…' : 'Email me a code'}
          </Button>
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
            Check <b>{email}</b> and enter the code from the email.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Code"
            className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="123456"
          />
          <Button type="submit" variant="primary" big className="w-full" disabled={busy || code.length < 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </Button>
        </form>
      )}
      <Button variant="ghost" className="w-full" onClick={onBack}>
        Back to password sign-in
      </Button>
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </>
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
