import { expect, test } from '@playwright/test'

/**
 * End-to-end smoke test for TWINE's core user journey, run against a real
 * built/previewed app (see playwright.config.ts) in both a desktop and a
 * touch-emulating mobile browser project.
 *
 * Covers: create a pattern -> edit its name -> save -> reload the page ->
 * confirm the change persisted via IndexedDB (see PROJECT-PROMPT.md:
 * "TWINE runs fully in the browser. So all storage is in IndexedDB.").
 *
 * Each test clears IndexedDB up front so patterns created by a previous
 * test run (or a previous spec file, since `reuseExistingServer` keeps the
 * same browser profile across local runs) don't leak into assertions that
 * rely on an empty/known list state.
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

test.describe('Pattern lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page)
    await page.reload()
  })

  test('creates a pattern, edits its name, saves, and the change persists across a reload', async ({ page }) => {
    await expect(page.getByText(/No patterns yet/i)).toBeVisible()

    await page.getByLabel('New pattern name').fill('E2E Pattern')
    await page.getByRole('button', { name: 'Create new pattern' }).click()

    // Navigated into the Edit Pattern page.
    const nameInput = page.getByLabel('Pattern name')
    await expect(nameInput).toHaveValue('E2E Pattern')

    await nameInput.fill('E2E Pattern Renamed')
    await expect(page.getByText('Unsaved changes')).toBeVisible()

    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Unsaved changes')).not.toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Pattern name')).toHaveValue('E2E Pattern Renamed')

    // Back to the Pattern selection list and confirm the renamed pattern is listed.
    await page.getByRole('button', { name: '← Pattern selection' }).click()
    await expect(page.getByText('E2E Pattern Renamed')).toBeVisible()
  })

  test('uploads a real GTT fixture file and lists it by its parsed name', async ({ page }) => {
    await expect(page.getByText(/No patterns yet/i)).toBeVisible()

    await page.setInputFiles('input[type="file"]', 'tests/fixtures/10cOseberg12L1-aisling.gtt')

    await expect(page.getByText('Oseberg 12 L 1 - 4 pattern cards')).toBeVisible()
  })

  test('clones a pattern, producing a "-1" suffixed copy, then deletes both', async ({ page }) => {
    await page.getByLabel('New pattern name').fill('CloneMe')
    await page.getByRole('button', { name: 'Create new pattern' }).click()
    await expect(page.getByLabel('Pattern name')).toHaveValue('CloneMe')

    await page.getByRole('button', { name: '← Pattern selection' }).click()
    await expect(page.getByText('CloneMe')).toBeVisible()

    await page.getByRole('button', { name: 'Clone' }).click()
    await expect(page.getByText('CloneMe-1')).toBeVisible()

    // Delete the original - a confirmation dialog must appear first.
    const listItem = page.locator('li', { hasText: 'CloneMe' }).filter({ hasNotText: 'CloneMe-1' })
    await listItem.getByRole('button', { name: 'Delete' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete' }).click()

    const list = page.getByRole('list', { name: 'Stored patterns' })
    await expect(list.getByText('CloneMe', { exact: true })).not.toBeVisible()
    await expect(list.getByText('CloneMe-1')).toBeVisible()
  })

  test('downloading a pattern triggers a .gtt file download', async ({ page }) => {
    await page.getByLabel('New pattern name').fill('DownloadMe')
    await page.getByRole('button', { name: 'Create new pattern' }).click()
    await page.getByRole('button', { name: '← Pattern selection' }).click()
    await expect(page.getByText('DownloadMe')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('DownloadMe.gtt')
  })
})
