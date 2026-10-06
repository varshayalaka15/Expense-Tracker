import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { portalLink } from '../../lib/portal'
import type { Portal } from '../../lib/portal'

export function AuthScreen({ portal }: { portal: Portal }) {
  const admin = portal === 'admin'
  const [signup, setSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const submitting = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || submitting.current) return
    submitting.current = true
    setBusy(true); setError(''); setMessage('')
    try {
      const credentials = { email: email.trim(), password }
      const { data, error: authError } = signup
        ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: new URL(portalLink(import.meta.env.BASE_URL, 'upload'), window.location.origin).href } })
        : await supabase.auth.signInWithPassword(credentials)
      if (authError) throw authError
      if (signup && !data.session) {
        setMessage('Check your email to confirm your account, then return here to sign in.')
        setPassword('')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.')
    } finally { submitting.current = false; setBusy(false) }
  }

  return <main className="auth-page"><section className="panel auth-card">
    <p className="dialog-kicker">Expense Tracker · {admin ? 'Administrator' : 'Personal uploads'}</p><h1>{admin ? 'Admin sign in' : signup ? 'Create your account' : 'Welcome back'}</h1>
    <p className="auth-intro">{admin ? 'Sign in with the designated admin account to manage all submitted bills.' : 'Upload bills and keep your own expenses together, across devices.'}</p>
    <form onSubmit={submit}>
      <label className="field">Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></label>
      <label className="field">Password<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
      {signup ? <p className="receipt-help">Use at least 8 characters. You may need to confirm your email before signing in.</p> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {message ? <p className="success-notice" role="status">{message}</p> : null}
      <button className="button primary" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
      {!admin ? <button className="text-button" type="button" disabled={busy} onClick={() => { setSignup(value => !value); setError(''); setMessage('') }}>{signup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}</button> : null}
    </form>
    <p className="receipt-help">{admin ? 'Admin access is assigned by the project owner.' : 'You can see only your own bills. The designated administrator can review, edit, and delete all submissions.'}</p>
    <a className="text-button" href={portalLink(import.meta.env.BASE_URL, admin ? 'upload' : 'admin')}>{admin ? 'Go to personal uploads' : 'Administrator sign in'}</a>
  </section></main>
}
