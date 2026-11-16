import { expect, test } from '@playwright/test'

/**
 * Cards configuration: hole colour assignment via an explicit palette
 * picker (no click-to-cycle), with the field filled by the chosen colour.
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

test.describe('Cards configuration palette picker', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page)
    await page.reload()
    await page.getByLabel('New pattern name').fill('Palette Picker')
    await page.getByRole('button', { name: 'Create new pattern' }).click()
  })

  test('shows palette colours and assigns the selected one to the field', async ({ page }) => {
    const field = page.getByRole('button', { name: 'Card 1 hole A colour' })
    await expect(field).toHaveText('–')

    await field.click()
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeVisible()
    await expect(listbox.getByRole('option')).toHaveCount(17)
    await expect(listbox.getByRole('option', { name: 'Select palette colour 3' })).toHaveCSS(
      'background-color',
      'rgb(45, 79, 108)',
    )
    await expect(listbox.getByRole('option', { name: 'Select palette colour 5' })).toBeDisabled()

    await listbox.getByRole('option', { name: 'Select palette colour 3' }).click()
    await expect(field).toHaveText('3')
    await expect(field).toHaveCSS('background-color', 'rgb(45, 79, 108)')
    await expect(page.getByRole('listbox')).toHaveCount(0)
  })

  test('does not rotate the colour when the field is clicked repeatedly', async ({ page }) => {
    const field = page.getByRole('button', { name: 'Card 1 hole A colour' })
    await field.click()
    await page.getByRole('listbox').getByRole('option', { name: 'Select palette colour 2' }).click()
    await expect(field).toHaveText('2')

    await field.click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await expect(field).toHaveText('2')
    await field.click() // toggles the popover shut without changing the value
    await expect(field).toHaveText('2')
  })

  test('Unset clears the field again', async ({ page }) => {
    const field = page.getByRole('button', { name: 'Card 1 hole A colour' })
    await field.click()
    await page.getByRole('listbox').getByRole('option', { name: 'Select palette colour 4' }).click()
    await expect(field).toHaveText('4')

    await field.click()
    await page.getByRole('listbox').getByRole('option', { name: 'Unset' }).click()
    await expect(field).toHaveText('–')
  })
})
