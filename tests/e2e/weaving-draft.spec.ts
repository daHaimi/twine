import { expect, test } from '@playwright/test'

/**
 * Weaving-draft rendering and A4 print coverage.
 *
 * Exercises the Stage 3 view end-to-end: the thread-path chart, the
 * 1–4 repetition control (with a thicker separator between repetitions),
 * and the print stylesheet. The PDF assertion is desktop-only because
 * Chromium mobile emulation does not reliably support `page.pdf()`; the
 * print-media assertions run on both desktop and mobile projects.
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

test.describe('Weaving draft', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page)
    await page.reload()

    await page.getByLabel('New pattern name').fill('Draft Print')
    await page.getByRole('button', { name: 'Create new pattern' }).click()
    await page.getByRole('button', { name: 'Add pick' }).click()
    // Cycle card 1's first pick once: Idle -> F1.
    await page.getByRole('button', { name: 'Pick 1 card 1 action' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: /Weaving draft/ }).click()
  })

  test('renders the setup chart and direction strokes', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Weaving draft' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Threading & setup/ })).toBeVisible()
    expect(await page.locator('svg line').count()).toBeGreaterThan(0)
    await expect(page.getByTitle(/^Pick 1, card 1/)).toHaveAttribute('title', /\\/)
  })

  test('repeats the whole pattern 1-4 times', async ({ page }) => {
    const selector = page.getByLabel(/Repetitions/i)
    await expect(selector).toHaveValue('1')
    await expect(page.getByTitle(/^Pick 1$/)).toHaveCount(1)

    await selector.selectOption('3')
    await expect(page.getByTitle(/^Pick 1$/)).toHaveCount(3)
    await selector.selectOption('4')
    await expect(page.getByTitle(/^Pick 1$/)).toHaveCount(4)
  })

  test('print media hides the controls but keeps both charts', async ({ page }) => {
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('button', { name: 'Print' })).toBeHidden()
    await expect(page.getByRole('button', { name: /Back to Edit pattern/ })).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Weaving draft' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Threading & setup/ })).toBeVisible()
  })

  test('produces an A4 PDF of the draft', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chromium', 'page.pdf() is unsupported under mobile emulation')

    await page.getByLabel(/Repetitions/i).selectOption('2')
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    expect(pdf.length).toBeGreaterThan(1000)
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  })
})
