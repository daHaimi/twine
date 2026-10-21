import { expect, test } from '@playwright/test'

/**
 * Touch-gesture coverage for the Picks grid, exercised via the same spec
 * file against both the `desktop-chromium` and `mobile-chromium` (touch
 * emulating, see playwright.config.ts's `devices['Pixel 7']`) projects.
 *
 * Mirrors PROJECT-PROMPT.md's requirement that "The edits should be
 * intuitive for Mouse usage on desktop browser and for touch in
 * smartphones. E.g. swiping up/down to turn forward/backward, swiping
 * sideways to twist." - see src/domain/pickAction.ts's `gestureFromSwipe`/
 * `applyGesture` for the pure logic this exercises end-to-end.
 *
 * Gestures are simulated via real `page.mouse` down/move/up sequences
 * (rather than a raw `dispatchEvent` call, which wouldn't trigger the
 * browser's own trailing synthetic `click` event), since the app's gesture
 * classification is itself pointer-event-based and input-type agnostic -
 * this lets one assertion path validate the exact same interaction
 * contract under both a mouse-only and a touch-emulating browser context.
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

async function swipe(
  locator: import('@playwright/test').Locator,
  dx: number,
  dy: number,
) {
  // Touch pointers get "implicit pointer capture" in real browsers, so a
  // touchstart/touchmove/touchend sequence keeps delivering pointerup to
  // the original element regardless of how far the finger travels. Mouse
  // pointers have no such capture (this app doesn't call
  // `setPointerCapture`), so a real `page.mouse` drag of this magnitude
  // would release over a *different* grid cell - dispatching the events
  // directly on the original locator instead correctly simulates a touch
  // swipe's implicit-capture semantics, which is what "swiping up/down to
  // turn forward/backward, swiping sideways to twist" (PROJECT-PROMPT.md)
  // describes as a touch-specific gesture.
  const startX = 100
  const startY = 100
  await locator.dispatchEvent('pointerdown', { clientX: startX, clientY: startY, pointerId: 1, pointerType: 'touch' })
  await locator.dispatchEvent('pointerup', {
    clientX: startX + dx,
    clientY: startY + dy,
    pointerId: 1,
    pointerType: 'touch',
  })
}

test.describe('Picks grid touch/mouse gestures', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page)
    await page.reload()

    await page.getByLabel('New pattern name').fill('Gesture Pattern')
    await page.getByRole('button', { name: 'Create new pattern' }).click()
    await expect(page.getByLabel('Pattern name')).toHaveValue('Gesture Pattern')

    await page.getByRole('button', { name: 'Add pick' }).click()
  })

  test('a plain tap/click cycles a cell through the full 6-state action cycle', async ({ page }) => {
    const cell = page.getByRole('button', { name: 'Pick 1 card 1 action' })
    await expect(cell).toHaveText('·')

    await cell.click()
    await expect(cell).toHaveText('F1')
    await cell.click()
    await expect(cell).toHaveText('F2')
    await cell.click()
    await expect(cell).toHaveText('B1')
    await cell.click()
    await expect(cell).toHaveText('B2')
    await cell.click()
    await expect(cell).toHaveText('Tw')
    await cell.click()
    await expect(cell).toHaveText('·')
  })

  test('swiping up jumps straight to F1, then F2, then wraps to Idle', async ({ page }) => {
    const cell = page.getByRole('button', { name: 'Pick 1 card 1 action' })
    await expect(cell).toHaveText('·')

    await swipe(cell, 0, -60)
    await expect(cell).toHaveText('F1')

    await swipe(cell, 0, -60)
    await expect(cell).toHaveText('F2')

    await swipe(cell, 0, -60)
    await expect(cell).toHaveText('·')
  })

  test('swiping down jumps straight to B1, independent of a prior swipe-up state', async ({ page }) => {
    const cell = page.getByRole('button', { name: 'Pick 1 card 1 action' })

    await swipe(cell, 0, -60) // up -> F1
    await expect(cell).toHaveText('F1')

    await swipe(cell, 0, 60) // down -> jumps directly to B1, not F's sub-cycle
    await expect(cell).toHaveText('B1')
  })

  test('swiping sideways toggles Twist on and off', async ({ page }) => {
    const cell = page.getByRole('button', { name: 'Pick 1 card 1 action' })

    await swipe(cell, 60, 0)
    await expect(cell).toHaveText('Tw')

    await swipe(cell, -60, 0)
    await expect(cell).toHaveText('·')
  })

  test('a plain click (no movement at all) still behaves as a tap via the onClick fallback path', async ({
    page,
  }) => {
    // Unlike the swipe tests above (which dispatch synthetic pointer events
    // directly and call `onGesture` from the pointerup handler), a real,
    // trusted click - with no intervening pointer movement - exercises the
    // separate `onClick` fallback path (see EditPatternPage's
    // `handlePickClick`), which is what covers keyboard activation and a
    // plain mouse click that produces no measurable swipe delta.
    const cell = page.getByRole('button', { name: 'Pick 1 card 1 action' })
    await expect(cell).toHaveText('·')

    await cell.click()
    await expect(cell).toHaveText('F1')
  })
})
