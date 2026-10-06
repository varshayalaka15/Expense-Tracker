import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createExpenseRepository, expenseFromRow } from '../src/features/expenses/repository.ts'
import { UnconfirmedSaveError, localDate } from '../src/features/expenses/model.ts'

const userId = '11111111-1111-4111-8111-111111111111'
const draft = { date: localDate(new Date()), description: 'Groceries', category: 'Groceries', amountCents: 2550, paidBy: 'Alex', notes: '' }
const row = { ...draft, id: '22222222-2222-4222-8222-222222222222', user_id: userId, amount_cents: 2550, paid_by: 'Alex', receipt_path: `${userId}/existing/bill.png`, receipt_name: 'bill.png', receipt_size: 10, created_at: '2026-10-01T12:00:00Z' }
const photo = () => new File(['bill image bytes'], 'bill.png', { type: 'image/png' })

function mockClient({ writeError = false, readbackError = false, readbackCommits = false, cleanupError = false, uploadError = false, deleteError = false, pages = [[]], rpcError = false } = {}) {
  const calls = []
  let written, uploaded
  const storage = {
    async upload(path, file, options) { calls.push(['upload', path, file.type, options]); uploaded = path; return { error: uploadError ? new Error('Upload failed') : null } },
    async remove(paths) { calls.push(['cleanup', paths]); return { error: cleanupError ? new Error('Cleanup failed') : null } },
    async createSignedUrl(path, seconds) { calls.push(['sign', path, seconds]); return { data: { signedUrl: 'https://example.test/private' }, error: null } },
  }
  return {
    calls,
    get uploaded() { return uploaded },
    client: {
      storage: { from(bucket) { calls.push(['bucket', bucket]); return storage } },
      rpc(name) {
        calls.push(['rpc', name])
        const query = { order() { return query }, async range(start, end) {
          calls.push(['range', start, end])
          return { data: rpcError ? null : pages[start / 500] ?? [], error: rpcError ? new Error('Denied') : null }
        } }
        return query
      },
      from(table) {
        calls.push(['table', table])
        let operation = 'read'
        const query = {
          select() { return query },
          eq(field, value) { calls.push(['filter', field, value]); return query },
          order() { return query },
          async range(start, end) { calls.push(['range', start, end]); return { data: pages[start / 500] ?? [], error: null } },
          insert(value) { written = value; operation = 'write'; calls.push(['insert', value]); return query },
          update(value) { written = value; operation = 'write'; calls.push(['update', value]); return query },
          delete() { operation = 'delete'; calls.push(['delete']); return query },
          async single() { return { data: writeError ? null : { ...written, created_at: row.created_at }, error: writeError ? new Error('Write failed') : null } },
          async maybeSingle() { calls.push(['readback']); return { data: readbackCommits ? { ...written, created_at: row.created_at } : null, error: readbackError ? new Error('Offline') : null } },
          then(resolve, reject) { return Promise.resolve({ data: operation === 'delete' ? [{ id: row.id }] : [], error: deleteError ? new Error('Delete failed') : null }).then(resolve, reject) },
        }
        return query
      },
    },
  }
}

test('database rows keep integer cents and private paths, without a public URL', () => {
  const expense = expenseFromRow(row)
  assert.equal(expense.amountCents, 2550)
  assert.equal(expense.receipt.path, row.receipt_path)
  assert.equal(expense.receipt.url, '')
  assert.equal(expense.sample, false)
  assert.equal(expense.ownerId, userId)
})
test('admin listing paginates through the protected RPC and includes uploader identity', async () => {
  const uploaded = { ...row, uploader_email: 'alex@example.com' }
  const mock = mockClient({ pages: [Array.from({ length: 500 }, () => uploaded), [uploaded]] })
  const results = await createExpenseRepository(mock.client).listAdmin()
  assert.equal(results.length, 501)
  assert.equal(results[0].uploaderEmail, 'alex@example.com')
  assert.ok(mock.calls.some(call => call[0] === 'rpc' && call[1] === 'list_admin_expenses'))
  await assert.rejects(createExpenseRepository(mockClient({ rpcError: true }).client).listAdmin(), /admin access/)
})
test('admin replacement keeps the original owner and targets the original account folder', async () => {
  const adminId = '33333333-3333-4333-8333-333333333333'
  const existing = expenseFromRow({ ...row, uploader_email: 'alex@example.com' })
  const mock = mockClient()
  const { expense } = await createExpenseRepository(mock.client).save(adminId, draft, photo(), existing)
  assert.equal(expense.ownerId, userId)
  assert.equal(expense.uploaderEmail, 'alex@example.com')
  assert.ok(mock.uploaded.startsWith(`${userId}/${row.id}/`))
  assert.equal(mock.calls.find(call => call[0] === 'update')[1].user_id, userId)
  assert.ok(mock.calls.some(call => call[0] === 'filter' && call[1] === 'user_id' && call[2] === userId))
})
test('admin deletion targets the uploader rather than the acting admin', async () => {
  const mock = mockClient()
  await createExpenseRepository(mock.client).remove('another-admin-id', expenseFromRow(row))
  assert.ok(mock.calls.some(call => call[0] === 'filter' && call[1] === 'user_id' && call[2] === userId))
})
test('list loads every page and scopes the query to the signed-in user', async () => {
  const mock = mockClient({ pages: [Array.from({ length: 500 }, () => row), [row]] })
  assert.equal((await createExpenseRepository(mock.client).list(userId)).length, 501)
  assert.deepEqual(mock.calls.filter(call => call[0] === 'range'), [['range', 0, 499], ['range', 500, 999]])
  assert.equal(mock.calls.filter(call => call[0] === 'filter' && call[1] === 'user_id' && call[2] === userId).length, 2)
})
test('creating an expense uploads privately before inserting the record', async () => {
  const mock = mockClient()
  const { expense } = await createExpenseRepository(mock.client).save(userId, draft, photo())
  assert.equal(expense.receipt.path, mock.uploaded)
  assert.ok(mock.uploaded.startsWith(`${userId}/${expense.id}/`))
  assert.ok(mock.calls.findIndex(call => call[0] === 'upload') < mock.calls.findIndex(call => call[0] === 'insert'))
  assert.equal(mock.calls.find(call => call[0] === 'upload')[3].upsert, false)
})
test('an upload failure never inserts an expense', async () => {
  const mock = mockClient({ uploadError: true })
  await assert.rejects(createExpenseRepository(mock.client).save(userId, draft, photo()), /could not be uploaded/)
  assert.ok(!mock.calls.some(call => call[0] === 'insert'))
})
test('a confirmed failed write removes the uploaded bill', async () => {
  const mock = mockClient({ writeError: true })
  await assert.rejects(createExpenseRepository(mock.client).save(userId, draft, photo()), /could not be saved/)
  assert.deepEqual(mock.calls.find(call => call[0] === 'cleanup')[1], [mock.uploaded])
})
test('an ambiguous write preserves the photo and blocks blind retries', async () => {
  const mock = mockClient({ writeError: true, readbackError: true })
  await assert.rejects(createExpenseRepository(mock.client).save(userId, draft, photo()), UnconfirmedSaveError)
  assert.ok(!mock.calls.some(call => call[0] === 'cleanup'))
})
test('readback recovers a committed write after a lost response', async () => {
  const mock = mockClient({ writeError: true, readbackCommits: true })
  const { expense } = await createExpenseRepository(mock.client).save(userId, draft, photo())
  assert.equal(expense.receipt.path, mock.uploaded)
  assert.ok(!mock.calls.some(call => call[0] === 'cleanup'))
})
test('editing details without replacing a bill skips uploading', async () => {
  const mock = mockClient()
  const { expense } = await createExpenseRepository(mock.client).save(userId, { ...draft, amountCents: 3000 }, null, expenseFromRow(row))
  assert.equal(expense.id, row.id)
  assert.equal(expense.receipt.path, row.receipt_path)
  assert.ok(!mock.calls.some(call => call[0] === 'upload' || call[0] === 'cleanup'))
})
test('replacing a bill cleans up the old image only after the update succeeds', async () => {
  const mock = mockClient({ cleanupError: true })
  const result = await createExpenseRepository(mock.client).save(userId, draft, photo(), expenseFromRow(row))
  assert.equal(result.cleanupFailed, true)
  assert.deepEqual(mock.calls.find(call => call[0] === 'cleanup')[1], [row.receipt_path])
  assert.ok(mock.calls.findIndex(call => call[0] === 'update') < mock.calls.findIndex(call => call[0] === 'cleanup'))
})
test('deletion removes the row before its bill, and a failed delete keeps the bill', async () => {
  const mock = mockClient()
  await createExpenseRepository(mock.client).remove(userId, expenseFromRow(row))
  assert.ok(mock.calls.findIndex(call => call[0] === 'delete') < mock.calls.findIndex(call => call[0] === 'cleanup'))
  const failed = mockClient({ deleteError: true })
  await assert.rejects(createExpenseRepository(failed.client).remove(userId, expenseFromRow(row)), /could not be deleted/)
  assert.ok(!failed.calls.some(call => call[0] === 'cleanup'))
})
test('viewing a bill requests a short-lived signed URL', async () => {
  const mock = mockClient()
  await createExpenseRepository(mock.client).receiptUrl(row.receipt_path)
  assert.deepEqual(mock.calls.find(call => call[0] === 'sign'), ['sign', row.receipt_path, 300])
})
test('invalid expenses and unsupported photos fail before network requests', async () => {
  const mock = mockClient()
  const repository = createExpenseRepository(mock.client)
  await assert.rejects(repository.save(userId, { ...draft, amountCents: -1 }, photo()))
  await assert.rejects(repository.save(userId, draft, null))
  await assert.rejects(repository.save(userId, draft, new File(['pdf'], 'bill.pdf', { type: 'application/pdf' })))
  assert.deepEqual(mock.calls, [])
})
