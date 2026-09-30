export const categories = ['Groceries', 'Utilities', 'Transport', 'Household', 'Other'] as const
export type Category = typeof categories[number]
export interface Receipt { url: string; name: string; size: number }
export interface ExpenseDraft { date: string; description: string; category: Category; amountCents: number; paidBy: string; notes: string }
export interface Expense extends ExpenseDraft { id: string; createdAt: number; receipt: Receipt; sample: boolean }
export interface FormValues { date: string; description: string; category: string; amount: string; paidBy: string; notes: string }
export type FormErrors = Partial<Record<keyof FormValues | 'receipt', string>>
export const maxReceiptBytes = 10 * 1024 * 1024
export const receiptTypes = ['image/jpeg', 'image/png', 'image/webp']
export function localDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
export const today = () => localDate(new Date())
export function parseAmount(value: string): number | null {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return cents > 0 ? cents : null
}
export const formatMoney = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
export const formatDate = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
export function validateForm(values: FormValues, receiptReady: boolean, currentDate = today()): FormErrors {
  const errors: FormErrors = {}
  const parsedDate = new Date(`${values.date}T12:00:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) || Number.isNaN(parsedDate.getTime()) || localDate(parsedDate) !== values.date || values.date > currentDate) errors.date = 'Choose a valid date on or before today.'
  if (!values.description.trim()) errors.description = 'Enter the store or a description.'
  if (!categories.includes(values.category as Category)) errors.category = 'Choose a category.'
  if (parseAmount(values.amount.trim()) === null) errors.amount = 'Enter a positive amount with up to two decimal places (maximum $99,999,999.99).'
  if (!values.paidBy.trim()) errors.paidBy = 'Enter the name of the person who paid.'
  if (!receiptReady) errors.receipt = 'Attach a readable bill photo before saving.'
  return errors
}
export function validateReceipt(file: Pick<File, 'type' | 'size'>): string | null {
  if (!receiptTypes.includes(file.type)) return 'Choose a JPEG, PNG, or WebP photo.'
  if (file.size === 0) return 'This file is empty. Choose another bill photo.'
  if (file.size > maxReceiptBytes) return 'This photo is larger than 10 MB. Choose a smaller photo.'
  return null
}
export function periodTotals(expenses: Pick<Expense, 'date' | 'amountCents'>[], now = new Date()) {
  const end = localDate(now)
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
  const start = localDate(monday)
  return expenses.reduce((totals, expense) => {
    if (expense.date >= start && expense.date <= end) totals.week += expense.amountCents
    if (expense.date.slice(0, 7) === end.slice(0, 7) && expense.date <= end) totals.month += expense.amountCents
    return totals
  }, { week: 0, month: 0 })
}
export function makeSamples(baseUrl = '/'): Expense[] {
  const rows: [string, Category, number, string, number][] = [['Weekly grocery run', 'Groceries', 6845, 'Alex', 0], ['Electricity bill', 'Utilities', 9200, 'Sam', 1], ['Bus passes', 'Transport', 2400, 'Alex', 2], ['Kitchen essentials', 'Household', 3275, 'Sam', 3], ['Fruit & vegetables', 'Groceries', 1860, 'Alex', 4]]
  return rows.map(([description, category, amountCents, paidBy, days], index) => {
    const date = new Date(); date.setDate(date.getDate() - days)
    return { id: `sample-${index}`, createdAt: 5 - index, date: localDate(date), description, category, amountCents, paidBy, notes: 'Sample expense for the frontend preview. The attached image is an illustrative bill.', sample: true, receipt: { url: `${baseUrl}sample-receipt.svg`, name: 'illustrative-sample-bill.svg', size: 0 } }
  })
}
