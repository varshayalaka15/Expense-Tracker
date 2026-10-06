import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from './App'
import { AuthScreen } from './features/auth/AuthScreen'
import { configurationError, supabase } from './lib/supabase'
import { currentPortal, portalLink } from './lib/portal'
import { AdminGate } from './features/auth/AdminGate'

export default function AppEntry() {
  const portal = currentPortal(window.location.search)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!supabase) return
    let active = true
    let changed = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      changed = true
      if (active) { setSession(next); setLoading(false); setError('') }
    })
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) { setError('Unable to restore your session. Please retry.'); setLoading(false) }
      else if (!changed) { setSession(data.session); setLoading(false) }
    }).catch(() => { if (active) { setError('Unable to restore your session. Please retry.'); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [attempt])

  if (configurationError) return <main className="auth-page"><section className="panel auth-card"><h1>Finish backend setup</h1><p>{configurationError} Update .env.local and restart the app.</p></section></main>
  if (!supabase) return portal === 'admin' ? <main className="auth-page"><section className="panel auth-card"><h1>Admin setup required</h1><p className="auth-intro">Connect Supabase to use the administrator page. Demo mode has no administrator access.</p><a className="button primary" href={portalLink(import.meta.env.BASE_URL, 'upload')}>Open demo</a></section></main> : <App key="demo" />
  if (error) return <main className="auth-page"><section className="panel auth-card"><p role="alert">{error}</p><button className="button secondary" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1) }}>Retry</button></section></main>
  if (loading) return <main className="auth-page"><p role="status">Restoring your session…</p></main>
  if (!session) return <AuthScreen portal={portal} />
  if (portal === 'admin') return <AdminGate key={`${session.user.id}:admin-gate`} user={session.user} />
  return <App key={`${session.user.id}:upload`} user={session.user} />
}
