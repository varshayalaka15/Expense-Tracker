import { Dialog } from '../../components/Dialog'
import { formatDate, formatMoney } from './model'
import type { Expense } from './model'

export function ReceiptDetails({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  return <Dialog title="Expense & bill" onClose={onClose} className="details-dialog">
    <div className="details-layout"><section className="expense-details"><span className="category-tag">{expense.category}</span><h3>{expense.description}</h3><strong className="detail-amount">{formatMoney(expense.amountCents)}</strong><dl><div><dt>Date</dt><dd>{formatDate(expense.date)}</dd></div><div><dt>Paid by</dt><dd>{expense.paidBy}</dd></div><div><dt>Bill file</dt><dd>{expense.receipt.name}</dd></div></dl>{expense.notes ? <div className="detail-notes"><h4>Notes</h4><p>{expense.notes}</p></div> : null}{expense.sample ? <p className="preview-note">Sample entry. This illustration is not an actual bill for this expense.</p> : null}</section>
    <figure className="bill-view"><figcaption>{expense.sample ? 'Illustrative sample bill' : 'Attached bill photo'}</figcaption><img src={expense.receipt.url} alt={expense.sample ? 'Illustrative sample receipt, marked as a sample' : `Bill photo for ${expense.description}, paid by ${expense.paidBy}`} /></figure></div>
    <footer className="dialog-footer"><span>Keep the details together.</span><button className="button secondary" onClick={onClose}>Close</button></footer>
  </Dialog>
}
