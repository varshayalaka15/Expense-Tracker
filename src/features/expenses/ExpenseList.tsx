import { Icon } from '../../components/Icon'
import { formatDate, formatMoney } from './model'
import type { Expense } from './model'

export function ExpenseList({ expenses, onView, onAdd, showUploader = false }: { expenses: Expense[]; onView: (expense: Expense) => void; onAdd?: () => void; showUploader?: boolean }) {
  if (!expenses.length) return <div className="empty-state"><Icon name="receipt" /><h3>{showUploader ? 'No bills match these filters' : 'No expenses here yet'}</h3><p>{showUploader ? 'Submitted bills appear here. Try selecting all uploaders and categories.' : 'Add an expense and its bill to start your list.'}</p>{onAdd ? <button className="button primary" onClick={onAdd}>Add expense</button> : null}</div>
  return <ul className="expense-list">{expenses.map(expense => <li className="expense-row" key={expense.id}>
    <span className={`expense-icon category-${expense.category.toLowerCase()}`}><Icon name={expense.category === 'Groceries' ? 'bag' : expense.category === 'Household' ? 'house' : 'receipt'} /></span>
    <div className="expense-description"><strong>{expense.description}</strong><div className="expense-meta"><time dateTime={expense.date}>{formatDate(expense.date)}</time><span>Paid by {expense.paidBy}</span>{showUploader ? <span>Uploaded by {expense.uploaderEmail || `Account ${expense.ownerId?.slice(0, 8)}`}</span> : null}{expense.sample ? <span className="sample-badge">Sample</span> : null}</div></div>
    <span className={`category-tag category-${expense.category.toLowerCase()}`}>{expense.category}</span>
    <div className="expense-amount"><strong>{formatMoney(expense.amountCents)}</strong><button className="text-button" onClick={() => onView(expense)} aria-label={`View bill for ${expense.description}, ${formatDate(expense.date)}`}><Icon name="paperclip" />View bill</button></div>
  </li>)}</ul>
}
