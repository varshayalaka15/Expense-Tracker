import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { portalLink } from './lib/portal'
import type { Portal } from './lib/portal'
import { createExpenseRepository } from './features/expenses/repository'
import { Icon } from './components/Icon'
import { ExpenseForm } from './features/expenses/ExpenseForm'
import { ExpenseList } from './features/expenses/ExpenseList'
import { ReceiptDetails } from './features/expenses/ReceiptDetails'
import { categories, formatMoney, localDate, makeSamples, periodTotals } from './features/expenses/model'
import type { Category, Expense, ExpenseDraft } from './features/expenses/model'
import './App.css'

const repository = supabase ? createExpenseRepository(supabase) : null

export default function App({ user, portal = 'upload' }: { user?: User; portal?: Portal }) {
  const admin = portal === 'admin'
  const [now] = useState(() => new Date())
  const [expenses, setExpenses] = useState<Expense[]>(() => user ? [] : makeSamples(import.meta.env.BASE_URL))
  const [loading, setLoading] = useState(Boolean(user))
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [actionError, setActionError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [page, setPage] = useState<'overview' | 'expenses'>(admin ? 'expenses' : 'overview')
  const [filter, setFilter] = useState<Category | 'All'>('All')
  const [uploader, setUploader] = useState('All')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<Expense | null>(null)
  const [notice, setNotice] = useState('')
  const ownedUrls = useRef(new Set<string>())
  const userId = user?.id
  useEffect(() => {
    if (!userId || !repository) return
    let active = true
    void (admin ? repository.listAdmin() : repository.list(userId)).then(records => {
      if (active) { setExpenses(records); setLoading(false) }
    }).catch((cause: unknown) => {
      if (active) { setLoadError(cause instanceof Error ? cause.message : 'Could not load expenses.'); setLoading(false) }
    })
    return () => { active = false }
  }, [userId, attempt, admin])
  useEffect(() => {
    const urls = ownedUrls.current
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear() }
  }, [])
  const currentDate = localDate(now)
  const sorted = expenses.toSorted((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const visible = sorted.filter(e => (filter === 'All' || e.category === filter) && (!admin || uploader === 'All' || e.ownerId === uploader))
  const reporting = admin ? visible : expenses
  const totals = periodTotals(reporting, now)
  const monthly = reporting.filter(e => e.date.slice(0, 7) === currentDate.slice(0, 7) && e.date <= currentDate)
  const breakdown = categories.map(category => ({ category, total: monthly.filter(e => e.category === category).reduce((sum, e) => sum + e.amountCents, 0) }))
  const uploaders = [...new Map(expenses.filter(e => e.ownerId).map(e => [e.ownerId!, e.uploaderEmail || `Account ${e.ownerId!.slice(0, 8)}`])).entries()].sort((a, b) => a[1].localeCompare(b[1]))

  async function save(draft: ExpenseDraft, file: File | null) {
    let expense: Expense
    let cleanupFailed = false
    if (userId && repository) {
      const result = await repository.save(userId, draft, file, editing ?? undefined)
      expense = result.expense
      cleanupFailed = result.cleanupFailed
    } else {
      const receipt = file ? { url: URL.createObjectURL(file), name: file.name, size: file.size } : editing?.receipt
      if (!receipt) throw new Error('Attach a bill photo before saving.')
      if (file) ownedUrls.current.add(receipt.url)
      if (file && editing && ownedUrls.current.delete(editing.receipt.url)) URL.revokeObjectURL(editing.receipt.url)
      expense = { ...draft, id: editing?.id ?? crypto.randomUUID(), ownerId: editing?.ownerId, uploaderEmail: editing?.uploaderEmail, createdAt: editing?.createdAt ?? Date.now(), receipt, sample: editing?.sample ?? false }
    }
    setExpenses(previous => editing ? previous.map(entry => entry.id === expense.id ? expense : entry) : [expense, ...previous])
    setAdding(false)
    setEditing(null)
    setNotice(`${editing ? 'Expense updated.' : 'Expense added.'} Your totals are up to date.${cleanupFailed ? ' The old bill could not be removed from storage; contact the project administrator to clean it up.' : ''}`)
  }
  async function remove(expense: Expense) {
    let cleanupFailed = false
    if (userId && repository) cleanupFailed = (await repository.remove(userId, expense)).cleanupFailed
    else if (ownedUrls.current.delete(expense.receipt.url)) URL.revokeObjectURL(expense.receipt.url)
    setExpenses(previous => previous.filter(entry => entry.id !== expense.id))
    if (admin && uploader === expense.ownerId && expenses.filter(entry => entry.ownerId === uploader).length === 1) setUploader('All')
    setSelected(null)
    setNotice(`Expense deleted.${cleanupFailed ? ' Its bill could not be removed from storage; contact the project administrator to clean it up.' : ''}`)
  }
  async function signOut() {
    if (!supabase || signingOut) return
    setSigningOut(true); setActionError('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    } catch { setActionError('Unable to sign out. Please try again.') }
    finally { setSigningOut(false) }
  }
  function reload() { setLoading(true); setLoadError(''); setSelected(null); setAttempt(value => value + 1) }
  function navigate(next: 'overview' | 'expenses') { setPage(next); setFilter('All'); setUploader('All') }
  async function copyLink(view: Portal) {
    setActionError('')
    try {
      await navigator.clipboard.writeText(new URL(portalLink(import.meta.env.BASE_URL, view), window.location.origin).href)
      setNotice(`${view === 'admin' ? 'Admin' : 'Upload'} link copied. A login is required to use it.`)
    } catch { setActionError('Could not copy the link. Copy the address from the page you want to share.') }
  }
  const summary = <section className="summary-grid" aria-label="Spending summary">
    <article className="summary primary-summary"><div className="summary-label">This week <Icon name="calendar" /></div><strong>{formatMoney(totals.week)}</strong><p>Monday through today</p><div className="summary-decoration" aria-hidden="true" /></article>
    <article className="summary"><div className="summary-label">This month <Icon name="receipt" /></div><strong>{formatMoney(totals.month)}</strong><p>{new Intl.DateTimeFormat('en-US', { month: 'long' }).format(now)} spending so far</p></article>
    <article className="summary"><div className="summary-label">Bills together <Icon name="paperclip" /></div><strong>{reporting.length}<span className="amount-unit"> expenses</span></strong><p>{admin ? 'For the selected filters' : 'Every expense has its bill'}</p></article>
  </section>
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#main" aria-label="Expense Tracker"><span className="brand-mark"><Icon name="house" /></span><span>Expense<br /><strong>Tracker</strong></span></a>
        <div className="household-label"><span className="household-avatar">{admin ? 'A' : 'H'}</span><div>{admin ? 'Administrator' : user ? 'My bills' : 'Our household'}<small>{admin ? 'All submitted bills' : 'A little more clarity'}</small></div></div>
        <nav aria-label="Main navigation">
          <button className={page === 'overview' ? 'nav-item active' : 'nav-item'} aria-current={page === 'overview' ? 'page' : undefined} onClick={() => navigate('overview')}><Icon name="grid" />Overview</button>
          <button className={page === 'expenses' ? 'nav-item active' : 'nav-item'} aria-current={page === 'expenses' ? 'page' : undefined} onClick={() => navigate('expenses')}><Icon name="receipt" />{admin ? 'All bills' : 'Expenses'}</button>
          <div className="nav-item future"><Icon name="box" /><span>Inventory<small>Coming later</small></span></div>
          <div className="nav-item future"><Icon name="bag" /><span>Shopping<small>Coming later</small></span></div>
        </nav>
        <div className="sidebar-note"><Icon name="leaf" /><p>Small expenses.<br />The whole picture.</p></div>
        <div className="sidebar-footer">Made for everyday life</div>
      </aside>
      <div className="workspace">
        <header className="topbar"><span>{admin ? 'Administrator' : user ? 'My expenses' : 'Our household'} <span className="breadcrumb">/ {page === 'overview' ? 'Overview' : admin ? 'All bills' : 'Expenses'}</span></span><div className="account-controls">{user ? <><span className="account-email">{user.email}</span><a className="text-button" href={portalLink(import.meta.env.BASE_URL, admin ? 'upload' : 'admin')}>{admin ? 'My uploads' : 'Admin'}</a><button className="button secondary" disabled={signingOut} onClick={signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button></> : <span className="prototype-pill"><span />Demo mode</span>}</div></header>
        <main id="main" className="main-content">
          <div className="page-heading"><div><p className="date-label">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now)}</p><h1>{admin ? 'All submitted bills.' : page === 'overview' ? user ? 'Your spending, at a glance.' : 'Your household, at a glance.' : 'Every expense, in one place.'}</h1><p>{admin ? 'Review and manage bills from every uploader.' : 'Keep the spending clear and the bills together.'}</p></div>{admin ? <div className="portal-actions"><button className="button secondary" onClick={() => copyLink('upload')}>Copy upload link</button><button className="button secondary" onClick={() => copyLink('admin')}>Copy admin link</button></div> : <button className="button primary" disabled={loading || Boolean(loadError)} onClick={() => setAdding(true)}><Icon name="plus" />Add expense</button>}</div>
          <div className="preview-note"><Icon name="info" /><p>{admin ? 'You can view, edit, and delete all submitted bills. Uploaders see only their own records.' : user ? 'Your bills are saved to your account. You see only your own records; the administrator can review and manage all submissions.' : 'This is a demo with sample expenses. New entries and bill photos stay in this tab and reset when you reload.'}</p>{user ? <button className="text-button" disabled={loading} onClick={reload}>Refresh</button> : null}</div>
          {admin && !loading && !loadError ? <div className="admin-filters"><label className="filter-label">Uploader<select value={uploader} onChange={e => setUploader(e.target.value)}><option value="All">All uploaders</option>{uploaders.map(([id, email]) => <option key={id} value={id}>{email}</option>)}</select></label><label className="filter-label">Category<select value={filter} onChange={e => setFilter(e.target.value as Category | 'All')}><option value="All">All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label><span>Totals reflect these filters.</span></div> : null}
          {actionError ? <p className="success-notice" role="alert">{actionError}</p> : null}
          <div role="status" aria-live="polite" className={notice ? 'success-notice' : 'sr-only'}>{notice}</div>
          {loading ? <section className="panel loading-panel" role="status">Loading your expenses…</section> : loadError ? <section className="panel loading-panel"><p role="alert">{loadError}</p><button className="button secondary" onClick={reload}>Retry</button></section> : page === 'overview' ? <>
            {summary}
            <section className="overview-grid">
              <div className="panel"><div className="section-heading"><div><h2>Recent expenses</h2><p>The little things that add up.</p></div><button className="text-button" onClick={() => navigate('expenses')}>View all <Icon name="arrow" /></button></div><ExpenseList expenses={(admin ? visible : sorted).slice(0, 5)} onView={setSelected} onAdd={admin ? undefined : () => setAdding(true)} showUploader={admin} /></div>
              <aside className="panel breakdown"><h2>Where it went</h2><p>This month, by category</p><div className="category-bars">{breakdown.map(({ category, total }) => <div className="category-row" key={category}><div><span>{category}</span><strong>{formatMoney(total)}</strong></div><div className="bar-track"><div className={`bar-fill category-${category.toLowerCase()}`} style={{ width: `${totals.month ? total / totals.month * 100 : 0}%` }} /></div></div>)}</div><div className="total-line"><span>Monthly total</span><strong>{formatMoney(totals.month)}</strong></div><div className="receipt-tip"><Icon name="receipt" /><div><strong>A bill for every expense</strong><p>Find the original photo whenever you need it.</p></div></div></aside>
            </section>
          </> : <>{admin ? summary : null}<section className="panel"><div className="section-heading"><div><h2>{admin ? 'Submitted bills' : 'Expenses'} <span className="count-badge">{visible.length}</span></h2><p>View a bill to see its photo and details.</p></div>{!admin ? <label className="filter-label">Category<select value={filter} onChange={e => setFilter(e.target.value as Category | 'All')}><option value="All">All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label> : null}</div><ExpenseList expenses={visible} onView={setSelected} onAdd={admin ? undefined : () => setAdding(true)} showUploader={admin} /></section></>}
          <footer className="main-footer"><span>One household. A clearer picture.</span><span>USD · No payments or bank connections</span></footer>
        </main>
      </div>
      {adding || editing ? <ExpenseForm expense={editing ?? undefined} persistent={Boolean(user)} onClose={() => { setAdding(false); setEditing(null); if (userId) reload() }} onSave={save} /> : null}
      {selected ? <ReceiptDetails key={selected.id} expense={selected} loadReceipt={repository?.receiptUrl} onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setSelected(null) }} onDelete={() => remove(selected)} /> : null}
    </div>
  )
}
