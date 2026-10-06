import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentPortal, portalLink } from '../src/lib/portal.ts'

test('personal uploads are the default, with admin available only through its explicit link', () => {
  assert.equal(currentPortal(''), 'upload')
  assert.equal(currentPortal('?view=upload'), 'upload')
  assert.equal(currentPortal('?view=admin'), 'admin')
  assert.equal(currentPortal('?view=unknown'), 'upload')
  assert.equal(portalLink('/Expense-Tracker/', 'admin'), '/Expense-Tracker/?view=admin')
  assert.equal(portalLink('/Expense-Tracker/', 'upload'), '/Expense-Tracker/?view=upload')
})
