import { useEffect, useRef, useState } from 'react'
import { Icon } from './components/Icon'
import { ExpenseForm } from './features/expenses/ExpenseForm'
import { ExpenseList } from './features/expenses/ExpenseList'
import { ReceiptDetails } from './features/expenses/ReceiptDetails'
import { categories, formatMoney, localDate, makeSamples, periodTotals } from './features/expenses/model'
import type { Category, Expense, ExpenseDraft } from './features/expenses/model'
import './App.css'

export default function App() {
  const [now] = useState(() => new Date())
  const [expenses, setExpenses] = useState<Expense[]>(() => makeSamples(import.meta.env.BASE_URL))
  const [page, setPage] = useState<'overview' | 'expenses'>('overview')
  const [filter, setFilter] = useState<Category | 'All'>('All')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<Expense | null>(null)
  const [notice, setNotice] = useState('')
  const ownedUrls = useRef(new Set<string>())
  useEffect(() => {
    const urls = ownedUrls.current
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear() }
  }, [])
  const currentDate = localDate(now)
  const totals = periodTotals(expenses, now)
  const sorted = expenses.toSorted((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const visible = sorted.filter(e => filter === 'All' || e.category === filter)
  const monthly = expenses.filter(e => e.date.slice(0, 7) === currentDate.slice(0, 7) && e.date <= currentDate)
  const breakdown = categories.map(category => ({ category, total: monthly.filter(e => e.category === category).reduce((sum, e) => sum + e.amountCents, 0) }))

  function save(draft: ExpenseDraft, file: File) {
    const id = crypto.randomUUID()
    const url = URL.createObjectURL(file)
    const expense: Expense = { ...draft, id, createdAt: Date.now(), receipt: { url, name: file.name, size: file.size }, sample: false }
    ownedUrls.current.add(url)
    setExpenses(previous => [expense, ...previous])
    setAdding(false)
    setNotice('Expense added. Your totals are up to date.')
  }
  function navigate(next: 'overview' | 'expenses') { setPage(next); setFilter('All') }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#main" aria-label="Expense Tracker"><span className="brand-mark"><Icon name="house" /></span><span>Expense<br /><strong>Tracker</strong></span></a>
        <div className="household-label"><span className="household-avatar">H</span><div>Our household<small>A little more clarity</small></div></div>
        <nav aria-label="Main navigation">
          <button className={page === 'overview' ? 'nav-item active' : 'nav-item'} aria-current={page === 'overview' ? 'page' : undefined} onClick={() => navigate('overview')}><Icon name="grid" />Overview</button>
          <button className={page === 'expenses' ? 'nav-item active' : 'nav-item'} aria-current={page === 'expenses' ? 'page' : undefined} onClick={() => navigate('expenses')}><Icon name="receipt" />Expenses</button>
          <div className="nav-item future"><Icon name="box" /><span>Inventory<small>Coming later</small></span></div>
          <div className="nav-item future"><Icon name="bag" /><span>Shopping<small>Coming later</small></span></div>
        </nav>
        <div className="sidebar-note"><Icon name="leaf" /><p>Small expenses.<br />The whole picture.</p></div>
        <div className="sidebar-footer">Made for everyday life</div>
      </aside>
      <div className="workspace">
        <header className="topbar"><span>Our household <span className="breadcrumb">/ {page === 'overview' ? 'Overview' : 'Expenses'}</span></span><span className="prototype-pill"><span />Frontend preview</span></header>
        <main id="main" className="main-content">
          <div className="page-heading"><div><p className="date-label">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now)}</p><h1>{page === 'overview' ? 'Your household, at a glance.' : 'Every expense, in one place.'}</h1><p>Keep the spending clear and the bills together.</p></div><button className="button primary" onClick={() => setAdding(true)}><Icon name="plus" />Add expense</button></div>
          <div className="preview-note"><Icon name="info" /><p>This is a frontend preview with sample expenses. New entries and bill photos stay in this tab and reset when you reload.</p></div>
          <div role="status" aria-live="polite" className={notice ? 'success-notice' : 'sr-only'}>{notice}</div>
          {page === 'overview' ? <>
            <section className="summary-grid" aria-label="Spending summary">
              <article className="summary primary-summary"><div className="summary-label">This week <Icon name="calendar" /></div><strong>{formatMoney(totals.week)}</strong><p>Monday through today</p><div className="summary-decoration" aria-hidden="true" /></article>
              <article className="summary"><div className="summary-label">This month <Icon name="receipt" /></div><strong>{formatMoney(totals.month)}</strong><p>{new Intl.DateTimeFormat('en-US', { month: 'long' }).format(now)} spending so far</p></article>
              <article className="summary"><div className="summary-label">Bills together <Icon name="paperclip" /></div><strong>{expenses.length}<span className="amount-unit"> expenses</span></strong><p>Every expense has its bill</p></article>
            </section>
            <section className="overview-grid">
              <div className="panel"><div className="section-heading"><div><h2>Recent expenses</h2><p>The little things that add up.</p></div><button className="text-button" onClick={() => navigate('expenses')}>View all <Icon name="arrow" /></button></div><ExpenseList expenses={sorted.slice(0, 5)} onView={setSelected} onAdd={() => setAdding(true)} /></div>
              <aside className="panel breakdown"><h2>Where it went</h2><p>This month, by category</p><div className="category-bars">{breakdown.map(({ category, total }) => <div className="category-row" key={category}><div><span>{category}</span><strong>{formatMoney(total)}</strong></div><div className="bar-track"><div className={`bar-fill category-${category.toLowerCase()}`} style={{ width: `${totals.month ? total / totals.month * 100 : 0}%` }} /></div></div>)}</div><div className="total-line"><span>Monthly total</span><strong>{formatMoney(totals.month)}</strong></div><div className="receipt-tip"><Icon name="receipt" /><div><strong>A bill for every expense</strong><p>Find the original photo whenever you need it.</p></div></div></aside>
            </section>
          </> : <section className="panel"><div className="section-heading"><div><h2>Expenses <span className="count-badge">{visible.length}</span></h2><p>View a bill to see its photo and details.</p></div><label className="filter-label">Category<select value={filter} onChange={e => setFilter(e.target.value as Category | 'All')}><option value="All">All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label></div><ExpenseList expenses={visible} onView={setSelected} onAdd={() => setAdding(true)} /></section>}
          <footer className="main-footer"><span>One household. A clearer picture.</span><span>USD · No payments or bank connections</span></footer>
        </main>
      </div>
      {adding ? <ExpenseForm onClose={() => setAdding(false)} onSave={save} /> : null}
      {selected ? <ReceiptDetails expense={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
