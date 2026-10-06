import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import App from '../../App'
import { supabase } from '../../lib/supabase'
import { portalLink } from '../../lib/portal'

export function AdminGate({ user }: { user: User }) {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [signoutError, setSignoutError] = useState('')
  useEffect(() => {
    if (!supabase) return
    let active = true
    void Promise.resolve(supabase.rpc('is_admin')).then(({ data, error }) => {
      if (active) setStatus(error ? 'error' : data === true ? 'allowed' : 'denied')
    }).catch(() => { if (active) setStatus('error') })
    return () => { active = false }
  }, [attempt])
  async function signOut() {
    if (!supabase || signingOut) return
    setSigningOut(true); setSignoutError('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    } catch { setSignoutError('Could not sign out. Please try again.') }
    finally { setSigningOut(false) }
  }
  if (status === 'allowed') return <App key={`${user.id}:admin`} user={user} portal="admin" />
  return <main className="auth-page"><section className="panel auth-card">
    <p className="dialog-kicker">Administrator</p>
    <h1>{status === 'loading' ? 'Checking access…' : status === 'denied' ? 'Admin access required' : 'Could not check access'}</h1>
    <p className="auth-intro" role={status === 'loading' ? 'status' : 'alert'}>{status === 'loading' ? 'Checking your account permissions.' : status === 'denied' ? 'This account does not have administrator access. You can still upload and view your own bills.' : 'Please retry. The admin database setup must be applied before this page can load.'}</p>
    {status !== 'loading' ? <div className="portal-actions"><button className="button secondary" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>Retry access</button><a className="button primary" href={portalLink(import.meta.env.BASE_URL, 'upload')}>My bills</a><button className="button secondary" disabled={signingOut} onClick={signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button></div> : null}
    {signoutError ? <p role="alert" className="field-error">{signoutError}</p> : null}
  </section></main>
}
