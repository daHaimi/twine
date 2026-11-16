import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { EditPatternPage } from '@/pages/EditPattern/EditPatternPage'
import { createNewPattern } from '@/storage/patternRepository'
import { resetDbConnectionForTests } from '@/storage/db'
import { useEditPatternStore } from '@/state/editPatternStore'

beforeEach(async () => {
  await resetDbConnectionForTests()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('twine-db')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
  useEditPatternStore.setState({ pattern: undefined, loading: false, error: undefined, dirty: false })
})

function renderPageFor(patternId: string) {
  return render(
    <MemoryRouter initialEntries={[`/pattern/${patternId}`]}>
      <Routes>
        <Route path="/pattern/:patternId" element={<EditPatternPage />} />
        <Route path="/" element={<div>Pattern selection stub</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('EditPatternPage', () => {
  it('shows an error state for an unknown pattern id', async () => {
    renderPageFor('does-not-exist')
    expect(await screen.findByText(/No pattern found/i)).toBeInTheDocument()
  })

  it('loads and displays the pattern name, cards, and palette', async () => {
    const pattern = await createNewPattern('My Draft')
    renderPageFor(pattern.id)

    expect(await screen.findByDisplayValue('My Draft')).toBeInTheDocument()
    // Default pattern has 6 cards.
    expect(screen.getByRole('columnheader', { name: '6' })).toBeInTheDocument()
    expect(screen.getByLabelText('Palette colour 1')).toBeInTheDocument()
  })

  it('editing the name field marks the pattern dirty and shows the badge', async () => {
    const pattern = await createNewPattern('Original')
    renderPageFor(pattern.id)
    const nameInput = await screen.findByDisplayValue('Original')

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Changed')

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Changed')).toBeInTheDocument()
  })

  it('increasing card count does not prompt a confirmation dialog', async () => {
    const pattern = await createNewPattern('Grow')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('Grow')

    const countInput = screen.getByLabelText('Card count')
    await userEvent.clear(countInput)
    await userEvent.type(countInput, '7')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '7' })).toBeInTheDocument()
  })

  it('decreasing card count prompts a confirmation dialog, and cancelling leaves the count unchanged', async () => {
    const pattern = await createNewPattern('Shrink')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('Shrink')

    const countInput = screen.getByLabelText('Card count')
    await userEvent.clear(countInput)
    await userEvent.type(countInput, '3')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Removing 3 card\(s\)/i)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Still 6 cards (unchanged).
    expect(screen.getByRole('columnheader', { name: '6' })).toBeInTheDocument()
  })

  it('confirming a decreasing card count change applies it', async () => {
    const pattern = await createNewPattern('ShrinkConfirm')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('ShrinkConfirm')

    const countInput = screen.getByLabelText('Card count')
    await userEvent.clear(countInput)
    await userEvent.type(countInput, '2')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '3' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '2' })).toBeInTheDocument()
  })

  it('removing a single card via its row button prompts and applies renumbering', async () => {
    const pattern = await createNewPattern('RemoveOne')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('RemoveOne')

    await userEvent.click(screen.getByRole('button', { name: 'Remove card 3' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Removing Card 3/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // 6 cards -> 5 after removal, renumbered contiguously.
    expect(screen.getByRole('columnheader', { name: '5' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '6' })).not.toBeInTheDocument()
  })

  it('toggling a card threading select updates that card only', async () => {
    const pattern = await createNewPattern('Threading')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('Threading')

    const select = screen.getByLabelText('Card 2 threading') as HTMLSelectElement
    await userEvent.selectOptions(select, 'Z')
    expect(select.value).toBe('Z')

    const otherSelect = screen.getByLabelText('Card 1 threading') as HTMLSelectElement
    expect(otherSelect.value).toBe('S')
  })

  it('adding and removing a pack works, including assigning cards to it', async () => {
    const pattern = await createNewPattern('Packs')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('Packs')

    const packNameInput = screen.getByPlaceholderText('New pack name')
    await userEvent.type(packNameInput, 'MyPack')
    await userEvent.click(screen.getByRole('button', { name: 'Add pack' }))

    expect(screen.getByText('MyPack', { selector: 'strong' })).toBeInTheDocument()

    const packItem = screen.getByText('MyPack', { selector: 'strong' }).closest('li')!
    const card1Checkbox = within(packItem).getAllByRole('checkbox')[0]
    await userEvent.click(card1Checkbox)
    expect(card1Checkbox).toBeChecked()

    await userEvent.click(within(packItem).getByRole('button', { name: 'Remove pack' }))
    expect(screen.queryByText('MyPack', { selector: 'strong' })).not.toBeInTheDocument()
  })

  it('clicking a hole colour cell cycles it through assigned palette colours', async () => {
    const pattern = await createNewPattern('HoleColours')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('HoleColours')

    const cell = screen.getByRole('button', { name: 'Card 1 hole A colour' })
    expect(cell).toHaveTextContent('')

    await userEvent.click(cell)
    expect(cell).toHaveTextContent('1')

    const otherCell = screen.getByRole('button', { name: 'Card 2 hole A colour' })
    expect(otherCell).toHaveTextContent('')
  })

  it('a hole colour cell completes the full cycle through all assigned palette slots and back to unset', async () => {
    const pattern = await createNewPattern('HoleColourFullCycle')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('HoleColourFullCycle')

    const cell = screen.getByRole('button', { name: 'Card 1 hole A colour' })
    for (const expected of ['1', '2', '3', '4', '']) {
      await userEvent.click(cell)
      expect(cell).toHaveTextContent(expected)
    }
  })

  it('unsetting a palette colour disables its colour input', async () => {
    const pattern = await createNewPattern('PaletteUnset')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('PaletteUnset')

    const colourInput = screen.getByLabelText('Palette colour 1') as HTMLInputElement
    expect(colourInput).not.toBeDisabled()

    const unsetCheckbox = colourInput.closest('div')!.querySelector('input[type="checkbox"]')!
    await userEvent.click(unsetCheckbox)
    expect(colourInput).toBeDisabled()
  })

  it('re-checking "Unset" after it was cleared disables the colour input again', async () => {
    const pattern = await createNewPattern('PaletteReunset')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('PaletteReunset')

    // Slot 10 starts unset by default.
    const colourInput = screen.getByLabelText('Palette colour 10') as HTMLInputElement
    const unsetCheckbox = colourInput.closest('div')!.querySelector('input[type="checkbox"]')!
    expect(colourInput).toBeDisabled()

    await userEvent.click(unsetCheckbox) // un-unset it
    expect(colourInput).not.toBeDisabled()

    await userEvent.click(unsetCheckbox) // unset it again
    expect(colourInput).toBeDisabled()
  })

  it('the error state\'s back button navigates to the Pattern selection page', async () => {
    renderPageFor('does-not-exist')
    await screen.findByText(/No pattern found/i)
    await userEvent.click(screen.getByRole('button', { name: 'Back to Pattern selection' }))
    expect(await screen.findByText('Pattern selection stub')).toBeInTheDocument()
  })

  it('header "Weaving draft" button navigates to the draft route', async () => {
    const pattern = await createNewPattern('ToDraft')
    render(
      <MemoryRouter initialEntries={[`/pattern/${pattern.id}`]}>
        <Routes>
          <Route path="/pattern/:patternId" element={<EditPatternPage />} />
          <Route path="/pattern/:patternId/draft" element={<div>Draft page stub</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('ToDraft')
    await userEvent.click(screen.getByRole('button', { name: /Weaving draft/i }))
    expect(await screen.findByText('Draft page stub')).toBeInTheDocument()
  })

  it('header "Save" button persists the pattern (clears the dirty badge after save)', async () => {
    const pattern = await createNewPattern('ToSave')
    renderPageFor(pattern.id)
    const nameInput = await screen.findByDisplayValue('ToSave')
    await userEvent.type(nameInput, ' Edited')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('reducing a card\'s hole count via the Holes input prompts and applies on confirm', async () => {
    const pattern = await createNewPattern('ReduceHoles')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('ReduceHoles')

    const holesInput = screen.getByLabelText('Card 1 holes')
    fireEvent.change(holesInput, { target: { value: '3' } })

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Reducing Card 1's holes/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Card 1 holes')).toHaveValue(3)
  })

  it('changing a pack\'s Order input updates its order', async () => {
    const pattern = await createNewPattern('PackOrder')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('PackOrder')

    await userEvent.type(screen.getByPlaceholderText('New pack name'), 'OrderPack')
    await userEvent.click(screen.getByRole('button', { name: 'Add pack' }))

    const packItem = screen.getByText('OrderPack', { selector: 'strong' }).closest('li')!
    const orderInput = within(packItem).getByRole('spinbutton')
    await userEvent.clear(orderInput)
    await userEvent.type(orderInput, '9')
    expect(orderInput).toHaveValue(9)
  })

  it('unchecking a card chip in a pack removes that card from it', async () => {
    const pattern = await createNewPattern('PackRemoveCard')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('PackRemoveCard')

    await userEvent.type(screen.getByPlaceholderText('New pack name'), 'ChipPack')
    await userEvent.click(screen.getByRole('button', { name: 'Add pack' }))

    const packItem = screen.getByText('ChipPack', { selector: 'strong' }).closest('li')!
    const card1Checkbox = within(packItem).getAllByRole('checkbox')[0]
    await userEvent.click(card1Checkbox) // check
    expect(card1Checkbox).toBeChecked()
    await userEvent.click(card1Checkbox) // uncheck
    expect(card1Checkbox).not.toBeChecked()
  })

  it('"Add pick" adds a row, and clicking a card cell cycles its action label', async () => {
    const pattern = await createNewPattern('PicksGrid')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('PicksGrid')

    await userEvent.click(screen.getByRole('button', { name: 'Add pick' }))
    const cell = screen.getByRole('button', { name: 'Pick 1 card 1 action' })
    expect(cell).toHaveTextContent('·')

    await userEvent.click(cell)
    expect(cell).toHaveTextContent('F1')
    await userEvent.click(cell)
    expect(cell).toHaveTextContent('F2')
  })

  it('the live draft preview updates immediately when a pick cell changes', async () => {
    const pattern = await createNewPattern('LivePreview')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('LivePreview')

    expect(screen.getByRole('heading', { name: 'Live draft preview' })).toBeInTheDocument()
    expect(screen.queryByTitle(/^Pick 1, card 1/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add pick' }))
    expect(screen.getByTitle('Pick 1, card 1, |')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Pick 1 card 1 action' }))
    // S-threaded + Forward renders as '\' per the brief's direction table.
    expect(screen.getByTitle('Pick 1, card 1, \\')).toBeInTheDocument()
    expect(screen.queryByTitle('Pick 1, card 1, |')).not.toBeInTheDocument()
  })

  it('the live preview has a link to the full weaving draft', async () => {
    const pattern = await createNewPattern('PreviewToDraft')
    render(
      <MemoryRouter initialEntries={[`/pattern/${pattern.id}`]}>
        <Routes>
          <Route path="/pattern/:patternId" element={<EditPatternPage />} />
          <Route path="/pattern/:patternId/draft" element={<div>Full draft stub</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('PreviewToDraft')
    await userEvent.click(screen.getByRole('button', { name: /Open full draft/i }))
    expect(await screen.findByText('Full draft stub')).toBeInTheDocument()
  })

  it('a vertical swipe-up gesture on a pick cell jumps straight to F1, then F2, then wraps to Idle', async () => {
    const pattern = await createNewPattern('PickSwipe')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('PickSwipe')

    await userEvent.click(screen.getByRole('button', { name: 'Add pick' }))
    const cell = screen.getByRole('button', { name: 'Pick 1 card 1 action' })
    expect(cell).toHaveTextContent('·')

    const swipeUp = () => {
      fireEvent.pointerDown(cell, { clientX: 0, clientY: 100 })
      fireEvent.pointerUp(cell, { clientX: 0, clientY: 20 }) // dy = -80, well past the swipe threshold
    }

    swipeUp()
    expect(cell).toHaveTextContent('F1')
    swipeUp()
    expect(cell).toHaveTextContent('F2')
    swipeUp()
    expect(cell).toHaveTextContent('·')
  })

  it('a small pointer movement below the swipe threshold still behaves as a normal tap (via the click event)', async () => {
    const pattern = await createNewPattern('PickTapFallback')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('PickTapFallback')

    await userEvent.click(screen.getByRole('button', { name: 'Add pick' }))
    const cell = screen.getByRole('button', { name: 'Pick 1 card 1 action' })

    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(cell, { clientX: 12, clientY: 11 }) // tiny delta, classified as 'tap'
    fireEvent.click(cell)
    expect(cell).toHaveTextContent('F1')
  })

  it('switching a row from Card-mode to Pack-mode prompts a confirmation and discards the prior card action', async () => {
    const pattern = await createNewPattern('PickModeSwitch')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('PickModeSwitch')

    await userEvent.type(screen.getByPlaceholderText('New pack name'), 'Switcher')
    await userEvent.click(screen.getByRole('button', { name: 'Add pack' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add pick' }))

    await userEvent.click(screen.getByRole('button', { name: 'Pick 1 card 1 action' }))
    expect(screen.getByRole('button', { name: 'Pick 1 card 1 action' })).toHaveTextContent('F1')

    await userEvent.click(screen.getByRole('button', { name: 'Pick 1 pack Switcher action' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/discard them and switch this row to Pack-level mode/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))

    expect(screen.getByRole('button', { name: 'Pick 1 pack Switcher action' })).toHaveTextContent('F1')
    expect(screen.getByRole('button', { name: 'Pick 1 card 1 action' })).toHaveTextContent('—')
  })

  it('only the last pick row shows a Remove button, and "Add pick" disables at the 128-pick limit', async () => {
    const pattern = await createNewPattern('PickLimit')
    renderPageFor(pattern.id)
    await screen.findByDisplayValue('PickLimit')

    await userEvent.click(screen.getByRole('button', { name: 'Add pick' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add pick' }))
    expect(screen.getByRole('button', { name: 'Remove pick 2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove pick 1' })).not.toBeInTheDocument()

    // Directly drive the remaining additions through the store (bypassing
    // userEvent) to reach the 128-pick limit quickly instead of performing
    // 126 slow simulated clicks.
    act(() => {
      for (let i = 0; i < 126; i += 1) useEditPatternStore.getState().addPick()
    })
    expect(screen.getByRole('button', { name: 'Add pick' })).toBeDisabled()
  })
})
