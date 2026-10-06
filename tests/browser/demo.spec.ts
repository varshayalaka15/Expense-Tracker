import { expect, test } from '@playwright/test'

test('the administrator link never opens a demo dashboard without Supabase', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/Expense-Tracker/?view=admin')
  await expect(page.getByRole('heading', { name: 'Admin setup required' })).toBeVisible()
  await expect(page.getByText('Weekly grocery run')).toHaveCount(0)
  await page.getByRole('link', { name: 'Open demo' }).click()
  await expect(page).toHaveURL(/\?view=upload$/)
  await expect(page.getByText('Demo mode')).toBeVisible()
  await expect(page.getByText('Weekly grocery run', { exact: true })).toBeVisible()
})
