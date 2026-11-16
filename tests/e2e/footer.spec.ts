import { expect, test } from '@playwright/test'

/** The site-wide footer appears on every route but is excluded from print output. */

async function clearStorage(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('twine-db')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
  })
}

test.describe('Site footer', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page)
    await page.reload()
  })

  test('shows the free-to-use statement and PayPal link on every page', async ({ page }) => {
    await expect(page.getByText(/TWINE is free to use/i)).toBeVisible()
    await expect(page.getByText(/If you like it, please buy me a coffee/i)).toBeVisible()
    const coffee = page.getByRole('link', { name: /Buy me a coffee/i })
    await expect(coffee).toHaveAttribute('href', 'https://www.paypal.me/tungavp')
    await expect(coffee).toHaveAttribute('target', '_blank')

    await page.getByLabel('New pattern name').fill('Footer Check')
    await page.getByRole('button', { name: 'Create new pattern' }).click()
    await expect(page.getByText(/TWINE is free to use/i)).toBeVisible()

    await page.getByRole('button', { name: /Weaving draft/ }).click()
    await expect(page.getByText(/TWINE is free to use/i)).toBeVisible()
  })

  test('is hidden when printing the weaving draft', async ({ page }) => {
    await page.getByLabel('New pattern name').fill('Footer Print')
    await page.getByRole('button', { name: 'Create new pattern' }).click()
    await page.getByRole('button', { name: /Weaving draft/ }).click()
    await expect(page.getByRole('heading', { name: 'Weaving draft' })).toBeVisible()

    await page.emulateMedia({ media: 'print' })
    await expect(page.getByText(/TWINE is free to use/i)).toBeHidden()
  })
})
