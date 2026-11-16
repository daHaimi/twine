import { expect, test } from '@playwright/test'

/**
 * Stage 4: the live weaving-draft preview alongside the Picks grid.
 * Verifies that pick edits are reflected immediately (without saving) and
 * that the preview links to the full Weaving Draft view.
 */

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

test.describe('Live draft preview', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page)
    await page.reload()
    await page.getByLabel('New pattern name').fill('Preview Pattern')
    await page.getByRole('button', { name: 'Create new pattern' }).click()
  })

  test('pick edits update the preview immediately and link to the full draft', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Live draft preview' })).toBeVisible()

    await page.getByRole('button', { name: 'Add pick' }).click()
    await expect(page.getByTitle('Pick 1, card 1, |')).toBeVisible()

    await page.getByRole('button', { name: 'Pick 1 card 1 action' }).click()
    // S-threaded + Forward -> '\' (brief's direction table).
    await expect(page.getByTitle('Pick 1, card 1, \\')).toBeVisible()
    await expect(page.getByTitle('Pick 1, card 1, |')).toHaveCount(0)

    await page.getByRole('button', { name: /Open full draft/i }).click()
    await expect(page.getByRole('heading', { name: 'Weaving draft' })).toBeVisible()
  })

  test('editing a later pick uses the incremental path and updates only its own row', async ({ page }) => {
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add pick' }).click()
    await expect(page.getByTitle(/^Pick [123], /)).toHaveCount(18) // 3 picks x 6 cards

    await page.getByRole('button', { name: 'Pick 3 card 2 action' }).click()
    await expect(page.getByTitle('Pick 3, card 2, \\')).toBeVisible()
    await expect(page.getByTitle('Pick 1, card 2, |')).toBeVisible()
    await expect(page.getByTitle('Pick 2, card 2, |')).toBeVisible()
  })
})
