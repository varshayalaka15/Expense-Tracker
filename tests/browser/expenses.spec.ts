import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const userId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '33333333-3333-4333-8333-333333333333'
const adminId = '55555555-5555-4555-8555-555555555555'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
type Row = { id: string; user_id: string; description: string; amount_cents: number; receipt_path: string; [key: string]: unknown }

async function backend(page: Page) {
  const rows: Row[] = []
  const uploads: string[] = []
  const cleanups: string[] = []
  let failWrites = false
  let failReads = false
  let failPhoto = false
  let writeDelay = 0
  let failRole = false
  let adminEnabled = true
  let adminLists = 0
  await page.route('https://test-project.supabase.co/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const token = request.headers().authorization?.replace('Bearer ', '')
    const actor = token?.includes('.') ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : undefined
    const isAdmin = actor === adminId && adminEnabled
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname === '/auth/v1/signup') return json({ user: { id: userId, email: 'alex@example.com' }, session: null })
    if (url.pathname === '/auth/v1/token') {
      const { email } = request.postDataJSON()
      const id = email === 'admin@example.com' ? adminId : email === 'sam@example.com' ? otherUserId : userId
      const user = { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: { admin: true }, created_at: new Date().toISOString() }
      const expires = Math.floor(Date.now() / 1000) + 3600
      const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: expires })).toString('base64url')}.test-signature`
      return json({ access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: expires, user })
    }
    if (url.pathname === '/auth/v1/logout') return json({})
    if (url.pathname === '/rest/v1/rpc/is_admin') return failRole ? json({ message: 'Role unavailable' }, 500) : json(isAdmin)
    if (url.pathname === '/rest/v1/rpc/list_admin_expenses') {
      adminLists++
      if (!isAdmin) return json({ message: 'Administrator access required', code: '42501' }, 403)
      const start = Number(url.searchParams.get('offset') || 0)
      const limit = Number(url.searchParams.get('limit') || 500)
      return json(rows.slice(start, start + limit).map(row => ({ ...row, uploader_email: row.user_id === otherUserId ? 'sam@example.com' : 'alex@example.com' })))
    }
    if (url.pathname === '/rest/v1/expenses') {
      if (method === 'GET') {
        if (failReads) return json({ message: 'Database unavailable', code: 'XX000' }, 503)
        const owner = url.searchParams.get('user_id')?.replace('eq.', '')
        expect([userId, otherUserId, adminId]).toContain(owner)
        if (!isAdmin && owner !== actor) return json([])
        const matches = rows.filter(row => row.user_id === owner && (!url.searchParams.has('id') || row.id === url.searchParams.get('id')?.replace('eq.', '')))
        return json(request.headers().accept?.includes('vnd.pgrst.object') ? matches[0] ?? null : matches)
      }
      if (method === 'POST' || method === 'PATCH') {
        if (writeDelay) await new Promise(resolve => setTimeout(resolve, writeDelay))
        if (failWrites) return json({ message: 'Write failed', code: 'XX000' }, 500)
        const input = request.postDataJSON() as Row
        if (!isAdmin && input.user_id !== actor) return json({ message: 'Denied' }, 403)
        const saved = { ...input, created_at: new Date().toISOString() }
        const index = rows.findIndex(row => row.id === input.id)
        if (index >= 0) rows[index] = saved
        else rows.push(saved)
        return json(saved, method === 'POST' ? 201 : 200)
      }
      if (method === 'DELETE') {
        const index = rows.findIndex(row => row.id === url.searchParams.get('id')?.replace('eq.', ''))
        if (index < 0 || (!isAdmin && rows[index].user_id !== actor)) return json([])
        const [deleted] = rows.splice(index, 1)
        return json([{ id: deleted.id }])
      }
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/receipts/')) {
      if (method === 'POST') return json({ signedURL: '/object/sign/receipts/test.png?token=private-test' })
      if (failPhoto) return route.fulfill({ status: 503, body: 'Unavailable' })
      return route.fulfill({ contentType: 'image/png', body: png })
    }
    if (url.pathname === '/storage/v1/object/receipts' && method === 'DELETE') {
      cleanups.push(...request.postDataJSON().prefixes)
      return json([])
    }
    if (url.pathname.startsWith('/storage/v1/object/receipts/') && method === 'POST') {
      uploads.push(url.pathname.replace('/storage/v1/object/receipts/', ''))
      return json({ Key: uploads.at(-1), Id: 'test-object-id' })
    }
    throw new Error(`Unexpected backend request: ${method} ${url.pathname}`)
  })
  return { rows, uploads, cleanups,
    failWrites(value: boolean) { failWrites = value },
    failReads(value: boolean) { failReads = value },
    failPhoto(value: boolean) { failPhoto = value },
    delayWrites(value: number) { writeDelay = value },
    failRole(value: boolean) { failRole = value },
    revokeAdmin() { adminEnabled = false },
    get adminLists() { return adminLists },
  }
}
async function login(page: Page, email = 'alex@example.com') {
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('example-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  if (email === 'admin@example.com') await expect(page.getByRole('heading', { name: 'All submitted bills.' })).toBeVisible()
  else await expect(page.getByRole('button', { name: 'Add expense', exact: true }).first()).toBeEnabled()
}
async function fillExpense(page: Page) {
  await page.getByRole('button', { name: 'Add expense', exact: true }).first().click()
  await page.getByLabel('Store or description').fill('Demo groceries')
  await page.getByLabel('Amount (USD)').fill('25.50')
  await page.getByLabel('Paid by').fill('Alex')
  await page.locator('#bill-photo').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Preview of the bill you selected')).toBeVisible()
}

test('signup explains email confirmation', async ({ page }) => {
  await backend(page)
  await page.goto('./')
  await page.getByRole('button', { name: 'Need an account? Sign up' }).click()
  await page.getByLabel('Email', { exact: true }).fill('alex@example.com')
  await page.getByLabel('Password', { exact: true }).fill('example-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Check your email')
})

test('save, reload, privately view, edit, replace a bill, delete, and sign out', async ({ page }, testInfo) => {
  const mock = await backend(page)
  await page.goto('./')
  await login(page)
  await expect(page.getByText('Weekly grocery run')).toHaveCount(0)
  await fillExpense(page)
  mock.delayWrites(300)
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(mock.rows).toHaveLength(1)
  await expect(page.locator('.summary').nth(1)).toContainText('$25.50')
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
  await page.reload()
  await expect(page.getByText('Demo groceries', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^View bill for Demo groceries/ }).click()
  const photo = page.getByAltText('Bill photo for Demo groceries, paid by Alex')
  await expect(photo).toBeVisible()
  await expect(photo).toHaveJSProperty('naturalWidth', 1)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Amount (USD)').fill('30.00')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(mock.uploads).toHaveLength(1)
  await expect(page.locator('.summary').nth(1)).toContainText('$30.00')
  await page.getByRole('button', { name: /^View bill for Demo groceries/ }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.locator('#bill-photo').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Preview of the bill you selected')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(mock.uploads).toHaveLength(2)
  expect(mock.cleanups).toEqual([mock.uploads[0]])
  await page.getByRole('button', { name: /^View bill for Demo groceries/ }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Keep expense' }).click()
  expect(mock.rows).toHaveLength(1)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Demo groceries', { exact: true })).toHaveCount(0)
  expect(mock.cleanups).toEqual(mock.uploads)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('validation and a failed save preserve the form for retry', async ({ page }) => {
  const mock = await backend(page)
  await page.goto('./')
  await login(page)
  await page.getByRole('button', { name: 'Add expense', exact: true }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense', exact: true }).click()
  await expect(page.getByText('Attach a readable bill photo before saving.')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await fillExpense(page)
  mock.failWrites(true)
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not be saved')
  await expect(page.getByLabel('Store or description')).toHaveValue('Demo groceries')
  expect(mock.rows).toHaveLength(0)
  expect(mock.cleanups).toEqual(mock.uploads)
  mock.failWrites(false)
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(mock.rows).toHaveLength(1)
})

test('load errors recover and signing into another account clears the previous records', async ({ page }) => {
  const mock = await backend(page)
  await page.goto('./')
  await login(page)
  await fillExpense(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  mock.failReads(true)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  // The SDK retries 503 responses with 1s, 2s, and 4s backoff first.
  await expect(page.getByRole('alert')).toContainText('Could not load expenses', { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Add expense', exact: true })).toBeDisabled()
  mock.failReads(false)
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('Demo groceries', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await login(page, 'sam@example.com')
  await expect(page.getByText('Demo groceries', { exact: true })).toHaveCount(0)
  await expect(page.locator('.summary').nth(1)).toContainText('$0.00')
})

test('receipt image errors can be retried without losing expense details', async ({ page }) => {
  const mock = await backend(page)
  await page.goto('./')
  await login(page)
  await fillExpense(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  mock.failPhoto(true)
  await page.getByRole('button', { name: /^View bill for Demo groceries/ }).click()
  await expect(page.getByRole('alert')).toContainText('bill image could not be loaded')
  mock.failPhoto(false)
  await page.getByRole('button', { name: 'Retry photo' }).click()
  await expect(page.getByAltText('Bill photo for Demo groceries, paid by Alex')).toHaveJSProperty('naturalWidth', 1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^View bill for Demo groceries/ })).toBeFocused()
})

function seedBills(mock: Awaited<ReturnType<typeof backend>>) {
  const date = new Date()
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  for (const [id, owner, description, amount, category, payer] of [
    ['22222222-2222-4222-8222-222222222222', userId, 'Alex groceries', 2550, 'Groceries', 'Alex'],
    ['44444444-4444-4444-8444-444444444444', otherUserId, 'Sam utility bill', 1000, 'Utilities', 'Sam'],
  ] as const) mock.rows.push({ id, user_id: owner, description, amount_cents: amount, category, paid_by: payer,
    date: day, notes: '', receipt_path: `${owner}/${id}/bill.png`, receipt_name: 'bill.png', receipt_size: png.length, created_at: date.toISOString() })
}

test('ordinary accounts cannot access the admin link even with admin user metadata', async ({ page }) => {
  const mock = await backend(page)
  seedBills(mock)
  await page.goto('./?view=admin')
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Need an account? Sign up' })).toHaveCount(0)
  await page.getByLabel('Email', { exact: true }).fill('alex@example.com')
  await page.getByLabel('Password', { exact: true }).fill('example-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible()
  expect(mock.adminLists).toBe(0)
  await expect(page.getByText('Sam utility bill', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'My bills', exact: true }).click()
  await expect(page).toHaveURL(/\?view=upload$/)
  await expect(page.getByText('Alex groceries', { exact: true })).toBeVisible()
  await expect(page.getByText('Sam utility bill', { exact: true })).toHaveCount(0)
})

test('admin views all bills, filters totals, edits and deletes other accounts, and switches to personal uploads', async ({ page }, testInfo) => {
  const mock = await backend(page)
  seedBills(mock)
  await page.goto('./?view=admin')
  await login(page, 'admin@example.com')
  await expect(page.getByText('Alex groceries', { exact: true })).toBeVisible()
  await expect(page.getByText('Sam utility bill', { exact: true })).toBeVisible()
  await expect(page.getByText('Uploaded by sam@example.com', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add expense', exact: true })).toHaveCount(0)
  await expect(page.locator('.summary').nth(1)).toContainText('$35.50')
  await page.screenshot({ path: testInfo.outputPath('admin-dashboard.png'), fullPage: true })
  await page.getByRole('combobox', { name: 'Uploader', exact: true }).selectOption(otherUserId)
  await expect(page.getByText('Alex groceries', { exact: true })).toHaveCount(0)
  await expect(page.locator('.summary').nth(1)).toContainText('$10.00')
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Groceries')
  await expect(page.getByText('No bills match these filters')).toBeVisible()
  await expect(page.locator('.summary').nth(1)).toContainText('$0.00')
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('All')
  await page.getByRole('button', { name: /^View bill for Sam utility bill/ }).click()
  await expect(page.getByAltText('Bill photo for Sam utility bill, paid by Sam')).toHaveJSProperty('naturalWidth', 1)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Amount (USD)').fill('15.00')
  await page.locator('#bill-photo').setInputFiles({ name: 'admin-replacement.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Preview of the bill you selected')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(mock.rows.find(row => row.description === 'Sam utility bill')?.user_id).toBe(otherUserId)
  expect(mock.uploads.at(-1)).toMatch(new RegExp(`^${otherUserId}/`))
  await expect(page.locator('.summary').nth(1)).toContainText('$15.00')
  await page.reload()
  await expect(page.getByText('Sam utility bill', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^View bill for Sam utility bill/ }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(mock.rows).toHaveLength(1)
  expect(mock.cleanups.at(-1)).toBe(mock.uploads.at(-1))
  await page.getByRole('link', { name: 'My uploads' }).click()
  await expect(page).toHaveURL(/\?view=upload$/)
  await expect(page.getByRole('button', { name: 'Add expense', exact: true }).first()).toBeEnabled()
  await expect(page.getByText('Alex groceries', { exact: true })).toHaveCount(0)
  await expect(page.locator('.summary').nth(1)).toContainText('$0.00')
})

test('admin role errors fail closed, recover, and revoked permissions block refreshed data', async ({ page }) => {
  const mock = await backend(page)
  seedBills(mock)
  mock.failRole(true)
  await page.goto('./?view=admin')
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com')
  await page.getByLabel('Password', { exact: true }).fill('example-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Could not check access' })).toBeVisible()
  expect(mock.adminLists).toBe(0)
  mock.failRole(false)
  await page.getByRole('button', { name: 'Retry access' }).click()
  await expect(page.getByText('Sam utility bill', { exact: true })).toBeVisible()
  mock.revokeAdmin()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Check your admin access')
  await expect(page.getByText('Sam utility bill', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible()
})
