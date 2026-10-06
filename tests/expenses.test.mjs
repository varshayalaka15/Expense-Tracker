import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAmount, periodTotals, validateForm, validateReceipt, maxReceiptBytes, makeSamples } from '../src/features/expenses/model.ts'

const valid = { date: '2026-09-29', description: 'Groceries', category: 'Groceries', amount: '12.34', paidBy: 'Alex', notes: '' }

test('money is parsed exactly in cents', () => {
  assert.equal(parseAmount('0.10'), 10)
  assert.equal(parseAmount('12.3'), 1230)
  assert.equal(parseAmount('99999999.99'), 9999999999)
  for (const value of ['0', '0.00', '-1', '1.234', '1e3', 'abc', '', '100000000', 'NaN']) assert.equal(parseAmount(value), null)
})
test('payer and decoded receipt are mandatory', () => {
  assert.deepEqual(validateForm(valid, true, '2026-09-29'), {})
  assert.ok(validateForm({ ...valid, paidBy: '  ' }, true, '2026-09-29').paidBy)
  assert.ok(validateForm(valid, false, '2026-09-29').receipt)
})
test('invalid dates, future dates, blank descriptions, and unknown categories fail', () => {
  for (const date of ['', '2026-02-30', '2026-09-30']) assert.ok(validateForm({ ...valid, date }, true, '2026-09-29').date)
  assert.ok(validateForm({ ...valid, description: ' ' }, true, '2026-09-29').description)
  assert.ok(validateForm({ ...valid, category: 'Unknown' }, true, '2026-09-29').category)
})
test('receipt file types and size boundaries are enforced', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(validateReceipt({ type, size: maxReceiptBytes }), null)
  assert.ok(validateReceipt({ type: 'application/pdf', size: 100 }))
  assert.ok(validateReceipt({ type: 'image/svg+xml', size: 100 }))
  assert.ok(validateReceipt({ type: 'image/png', size: maxReceiptBytes + 1 }))
  assert.ok(validateReceipt({ type: 'image/png', size: 0 }))
})
test('text lengths match the database limits', () => {
  assert.ok(validateForm({ ...valid, description: 'x'.repeat(161) }, true, '2026-09-29').description)
  assert.ok(validateForm({ ...valid, paidBy: 'x'.repeat(81) }, true, '2026-09-29').paidBy)
  assert.ok(validateForm({ ...valid, notes: 'x'.repeat(1001) }, true, '2026-09-29').notes)
})
test('weeks start Monday and future spending is excluded', () => {
  const expenses = [{ date: '2026-09-27', amountCents: 100 }, { date: '2026-09-28', amountCents: 10 }, { date: '2026-09-29', amountCents: 20 }, { date: '2026-09-30', amountCents: 500 }]
  assert.deepEqual(periodTotals(expenses, new Date(2026, 8, 29)), { week: 30, month: 130 })
  assert.deepEqual(periodTotals(expenses, new Date(2026, 8, 27)), { week: 100, month: 100 })
})
test('week can cross month and year without double counting', () => {
  assert.deepEqual(periodTotals([{ date: '2025-12-29', amountCents: 10 }, { date: '2026-01-01', amountCents: 20 }], new Date(2026, 0, 1)), { week: 30, month: 20 })
  assert.deepEqual(periodTotals([], new Date(2026, 0, 1)), { week: 0, month: 0 })
})
test('all sample entries are labeled and have an illustrative receipt', () => {
  const samples = makeSamples()
  assert.equal(samples.length, 5)
  assert.ok(samples.every(expense => expense.sample && expense.paidBy && expense.receipt.url === '/sample-receipt.svg'))
})
