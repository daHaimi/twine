import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { WeavingDraftPage } from '@/pages/WeavingDraft/WeavingDraftPage'
import { resetDbConnectionForTests } from '@/storage/db'
import { createNewPattern } from '@/storage/patternRepository'
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

  it('loads and displays the pattern name and placeholder note', async () => {
    const pattern = await createNewPattern('Draft Target')
    renderDraft(pattern.id, 'edit')
    expect(await screen.findByText('Draft Target')).toBeInTheDocument()
    expect(screen.getByText(/not implemented yet/i)).toBeInTheDocument()
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
