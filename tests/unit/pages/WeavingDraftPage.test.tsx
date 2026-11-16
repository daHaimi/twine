import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { WeavingDraftPage } from '@/pages/WeavingDraft/WeavingDraftPage'
import { resetDbConnectionForTests } from '@/storage/db'
import { createDefaultCards, createNewPattern, savePattern } from '@/storage/patternRepository'
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

function renderDraft(patternId: string, backTo: 'edit' | 'selection') {
  return render(
    <MemoryRouter initialEntries={[`/pattern/${patternId}/draft`]}>
      <Routes>
        <Route path="/pattern/:patternId/draft" element={<WeavingDraftPage backTo={backTo} />} />
        <Route path="/pattern/:patternId" element={<div>Edit page stub</div>} />
        <Route path="/" element={<div>Selection page stub</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WeavingDraftPage', () => {
  it('shows an error state for an unknown pattern id', async () => {
    renderDraft('missing', 'edit')
    expect(await screen.findByText(/No pattern found/i)).toBeInTheDocument()
  })

  it('loads and displays the pattern name and both draft charts', async () => {
    const pattern = await createNewPattern('Draft Target')
    renderDraft(pattern.id, 'edit')
    expect(await screen.findByText('Draft Target')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Threading & setup/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Weaving draft' })).toBeInTheDocument()
    expect(screen.getByText(/Add picks in the Edit pattern view/i)).toBeInTheDocument()
  })

  it('renders thread strokes and repeats the whole pattern on request', async () => {
    const base = await createNewPattern('Draft With Picks')
    await savePattern({
      ...base,
      cards: createDefaultCards(2, 4).map((card) => ({ ...card, holeColours: [1, 2, 3, 4] })),
      picks: [
        { mode: 'Card', actions: new Map([['1', { type: 'Turn', dir: 'F', dist: 1 }]]) },
        { mode: 'Card', actions: new Map([['2', { type: 'Turn', dir: 'B', dist: 1 }]]) },
      ],
    })

    const { container } = renderDraft(base.id, 'edit')
    expect(await screen.findByText('Draft With Picks')).toBeInTheDocument()
    expect(container.querySelectorAll('svg line').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle(/^Pick \d+$/)).toHaveLength(2)
    // Every draft cell shows its action in addition to the direction stroke.
    expect(screen.getByTitle('Pick 1, card 1, \\')).toHaveTextContent('F')
    expect(screen.getByTitle('Pick 2, card 2, /')).toHaveTextContent('B')
    expect(screen.getByTitle('Pick 1, card 2, |')).toHaveTextContent('.')

    await userEvent.selectOptions(screen.getByLabelText(/Repetitions/i), '3')
    expect(screen.getAllByTitle(/^Pick \d+$/)).toHaveLength(6)
  })

  it('offers common A4 margin presets and injects the selected @page rule', async () => {
    const pattern = await createNewPattern('Margins')
    const { container } = renderDraft(pattern.id, 'edit')
    await screen.findByText('Margins')

    const selector = screen.getByLabelText(/Margins/i)
    expect(selector).toHaveValue('20')
    expect(container.querySelector('style')?.textContent).toContain('margin: 20mm')

    await userEvent.selectOptions(selector, '30')
    expect(container.querySelector('style')?.textContent).toContain('margin: 30mm')
    expect(screen.getByRole('option', { name: 'Wide (30 mm)' })).toBeInTheDocument()
  })

  it('marks a two-hole turn with a trailing 2 in the cell label', async () => {
    const base = await createNewPattern('TwoTurns')
    await savePattern({
      ...base,
      cards: createDefaultCards(1, 4),
      picks: [{ mode: 'Card', actions: new Map([['1', { type: 'Turn', dir: 'F', dist: 2 }]]) }],
    })
    renderDraft(base.id, 'edit')
    expect(await screen.findByText('TwoTurns')).toBeInTheDocument()
    expect(screen.getByTitle('Pick 1, card 1, \\')).toHaveTextContent('F2')
  })

  it('"back" navigates to the Edit page when backTo="edit"', async () => {
    const pattern = await createNewPattern('BackToEdit')
    renderDraft(pattern.id, 'edit')
    await screen.findByText('BackToEdit')

    await userEvent.click(screen.getByRole('button', { name: /Back to Edit pattern/i }))
    expect(await screen.findByText('Edit page stub')).toBeInTheDocument()
  })

  it('"back" navigates to the Pattern selection page when backTo="selection"', async () => {
    const pattern = await createNewPattern('BackToSelection')
    renderDraft(pattern.id, 'selection')
    await screen.findByText('BackToSelection')

    await userEvent.click(screen.getByRole('button', { name: /Back to Pattern selection/i }))
    expect(await screen.findByText('Selection page stub')).toBeInTheDocument()
  })

  it('error state "Pattern selection" button navigates home', async () => {
    renderDraft('missing', 'edit')
    await screen.findByText(/No pattern found/i)
    await userEvent.click(screen.getByRole('button', { name: '← Pattern selection' }))
    expect(await screen.findByText('Selection page stub')).toBeInTheDocument()
  })
})
