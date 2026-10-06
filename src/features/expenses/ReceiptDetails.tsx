import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { formatDate, formatMoney } from './model'
import type { Expense } from './model'

export function ReceiptDetails({ expense, onClose, loadReceipt, onEdit, onDelete }: { expense: Expense; onClose: () => void; loadReceipt?: (path: string) => Promise<string>; onEdit: () => void; onDelete: () => Promise<void> }) {
  const [url, setUrl] = useState(expense.receipt.url)
  const [photoError, setPhotoError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const busy = useRef(false)
  useEffect(() => {
    const path = expense.receipt.path
    if (!path || !loadReceipt) return
    let active = true
    void loadReceipt(path).then(next => { if (active) setUrl(next) }).catch((cause: unknown) => {
      if (active) setPhotoError(cause instanceof Error ? cause.message : 'Could not load the bill.')
    })
    // Renew while the dialog stays open; URLs expire after five minutes.
    const timer = window.setTimeout(() => { setUrl(''); setPhotoError(''); setAttempt(value => value + 1) }, 240_000)
    return () => { active = false; window.clearTimeout(timer) }
  }, [expense.receipt.path, loadReceipt, attempt])
  async function remove() {
    if (busy.current) return
    busy.current = true; setDeleting(true); setDeleteError('')
    try { await onDelete() }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Could not delete the expense.') }
    finally { busy.current = false; setDeleting(false) }
  }
  return <Dialog title="Expense & bill" onClose={() => { if (!busy.current) onClose() }} className="details-dialog">
    <div className="details-layout"><section className="expense-details"><span className="category-tag">{expense.category}</span><h3>{expense.description}</h3><strong className="detail-amount">{formatMoney(expense.amountCents)}</strong><dl><div><dt>Date</dt><dd>{formatDate(expense.date)}</dd></div><div><dt>Paid by</dt><dd>{expense.paidBy}</dd></div>{expense.uploaderEmail ? <div><dt>Uploader</dt><dd>{expense.uploaderEmail}</dd></div> : null}<div><dt>Bill file</dt><dd>{expense.receipt.name}</dd></div></dl>{expense.notes ? <div className="detail-notes"><h4>Notes</h4><p>{expense.notes}</p></div> : null}{expense.sample ? <p className="preview-note">Sample entry. This illustration is not an actual bill for this expense.</p> : null}</section>
    <figure className="bill-view"><figcaption>{expense.sample ? 'Illustrative sample bill' : 'Attached bill photo'}</figcaption>{photoError ? <div><p role="alert">{photoError}</p><button className="button secondary" onClick={() => { setPhotoError(''); if (expense.receipt.path) { setUrl(''); setAttempt(value => value + 1) } else setUrl(expense.receipt.url) }}>Retry photo</button></div> : url ? <img src={url} onError={() => setPhotoError('The bill image could not be loaded. Please retry.')} alt={expense.sample ? 'Illustrative sample receipt, marked as a sample' : `Bill photo for ${expense.description}, paid by ${expense.paidBy}`} /> : <p role="status">Loading bill…</p>}</figure></div>
    {deleteError ? <p className="form-error" role="alert">{deleteError}</p> : null}
    {confirmDelete ? <div className="delete-confirm"><p>Delete this expense and its bill? This cannot be undone.</p><div><button className="button secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Keep expense</button><button className="button danger" disabled={deleting} onClick={remove}>{deleting ? 'Deleting…' : 'Confirm delete'}</button></div></div> : null}
    <footer className="dialog-footer"><span>Keep the details together.</span><div><button className="button secondary" disabled={deleting} onClick={onEdit}>Edit</button><button className="button danger" disabled={deleting} onClick={() => setConfirmDelete(true)}>Delete</button><button className="button secondary" disabled={deleting} onClick={onClose}>Close</button></div></footer>
  </Dialog>
}
