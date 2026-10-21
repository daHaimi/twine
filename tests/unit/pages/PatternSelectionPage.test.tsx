import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PatternSelectionPage } from '@/pages/PatternSelection/PatternSelectionPage'
import { resetDbConnectionForTests } from '@/storage/db'
import { createNewPattern } from '@/storage/patternRepository'
import { usePatternListStore } from '@/state/patternListStore'

beforeEach(async () => {
  await resetDbConnectionForTests()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('twine-db')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
  usePatternListStore.setState({ patterns: [], loading: false, error: undefined })
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<PatternSelectionPage />} />
        <Route path="/pattern/:patternId" element={<div>Edit page stub</div>} />
        <Route path="/draft/:patternId" element={<div>Draft page stub</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PatternSelectionPage', () => {
  it('shows the empty state when there are no stored patterns', async () => {
    renderPage()
    expect(await screen.findByText(/No patterns yet/i)).toBeInTheDocument()
  })

  it('lists existing patterns on mount', async () => {
    await createNewPattern('Existing One')
    renderPage()
    expect(await screen.findByText('Existing One')).toBeInTheDocument()
  })

  it('creates a new pattern and navigates to its edit page', async () => {
    renderPage()
    await screen.findByText(/No patterns yet/i)

    const input = screen.getByLabelText('New pattern name')
    await userEvent.type(input, 'Brand New')
    await userEvent.click(screen.getByRole('button', { name: 'Create new pattern' }))

    expect(await screen.findByText('Edit page stub')).toBeInTheDocument()
  })

  it('creating with a blank name falls back to "Untitled Pattern"', async () => {
    renderPage()
    await screen.findByText(/No patterns yet/i)
    await userEvent.click(screen.getByRole('button', { name: 'Create new pattern' }))
    expect(await screen.findByText('Edit page stub')).toBeInTheDocument()
  })

  it('renames a pattern inline via Enter', async () => {
    await createNewPattern('Before')
    renderPage()
    await screen.findByText('Before')

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const renameInput = screen.getByLabelText('Rename Before')
    await userEvent.clear(renameInput)
    await userEvent.type(renameInput, 'After{Enter}')

    expect(await screen.findByText('After')).toBeInTheDocument()
  })

  it('cancels an in-progress rename via Escape, leaving the original name', async () => {
    await createNewPattern('Stays')
    renderPage()
    await screen.findByText('Stays')

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const renameInput = screen.getByLabelText('Rename Stays')
    await userEvent.type(renameInput, 'Ignored{Escape}')

    expect(await screen.findByText('Stays')).toBeInTheDocument()
  })

  it('clones a pattern, adding it to the list with a "-1" suffix', async () => {
    await createNewPattern('Original')
    renderPage()
    await screen.findByText('Original')

    await userEvent.click(screen.getByRole('button', { name: 'Clone' }))

    expect(await screen.findByText('Original-1')).toBeInTheDocument()
    expect(screen.getByText('Original')).toBeInTheDocument()
  })

  it('deletes a pattern after confirming in the dialog', async () => {
    await createNewPattern('DeleteMe')
    renderPage()
    await screen.findByText('DeleteMe')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/No patterns yet/i)).toBeInTheDocument()
    expect(screen.queryByText('DeleteMe')).not.toBeInTheDocument()
  })

  it('cancelling the delete confirmation keeps the pattern', async () => {
    await createNewPattern('KeepMe')
    renderPage()
    await screen.findByText('KeepMe')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('KeepMe')).toBeInTheDocument()
  })

  it('navigates to the Weaving draft page directly from the list', async () => {
    await createNewPattern('DraftMe')
    renderPage()
    await screen.findByText('DraftMe')

    await userEvent.click(screen.getByRole('button', { name: 'Weaving draft' }))
    expect(await screen.findByText('Draft page stub')).toBeInTheDocument()
  })

  it('toggles dropzone styling on drag over/leave without crashing', async () => {
    renderPage()
    await screen.findByText(/No patterns yet/i)
    const dropzone = screen.getByTestId('dropzone')
    fireEvent.dragOver(dropzone)
    fireEvent.dragLeave(dropzone)
    expect(dropzone).toBeInTheDocument()
  })

  it('commits a rename on blur', async () => {
    await createNewPattern('BlurBefore')
    renderPage()
    await screen.findByText('BlurBefore')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const renameInput = screen.getByLabelText('Rename BlurBefore')
    fireEvent.change(renameInput, { target: { value: 'BlurAfter' } })
    fireEvent.blur(renameInput)
    expect(await screen.findByText('BlurAfter')).toBeInTheDocument()
  })

  it('shows an upload error when an invalid file is dropped/selected', async () => {
    renderPage()
    await screen.findByText(/No patterns yet/i)

    const fileInput = screen.getByLabelText('Choose file', { selector: 'input' }) as HTMLInputElement
    const badFile = new File(['not valid xml at all'], 'bad.gtt', { type: 'application/xml' })
    await userEvent.upload(fileInput, badFile)

    expect(await screen.findByText(/Failed to parse/i)).toBeInTheDocument()
  })

  it('imports a valid GTT file via the file input and lists it', async () => {
    renderPage()
    await screen.findByText(/No patterns yet/i)

    const validXml = `<TWData>
  <Pattern Type="Threaded">
    <Name><![CDATA[Uploaded]]></Name>
    <Cards Count="0"/>
    <Packs Count="0"/>
    <Picks Count="0"/>
    <Palette/>
  </Pattern>
</TWData>`
    const fileInput = screen.getByLabelText('Choose file', { selector: 'input' }) as HTMLInputElement
    const goodFile = new File([validXml], 'good.gtt', { type: 'application/xml' })
    await userEvent.upload(fileInput, goodFile)

    expect(await screen.findByText('Uploaded')).toBeInTheDocument()
  })

  it('handles a drag & drop of a valid GTT file onto the dropzone', async () => {
    renderPage()
    await screen.findByText(/No patterns yet/i)

    const validXml = `<TWData>
  <Pattern Type="Threaded">
    <Name><![CDATA[Dropped]]></Name>
    <Cards Count="0"/>
    <Packs Count="0"/>
    <Picks Count="0"/>
    <Palette/>
  </Pattern>
</TWData>`
    const dropFile = new File([validXml], 'dropped.gtt', { type: 'application/xml' })
    const dropzone = screen.getByTestId('dropzone')

    fireEvent.drop(dropzone, { dataTransfer: { files: [dropFile] } })

    expect(await screen.findByText('Dropped')).toBeInTheDocument()
  })
})

describe('PatternSelectionPage: download', () => {
  it('triggers a download when "Download" is clicked', async () => {
    await createNewPattern('Downloadable')
    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    try {
      renderPage()
      await screen.findByText('Downloadable')
      await userEvent.click(screen.getByRole('button', { name: 'Download' }))
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
      clickSpy.mockRestore()
    }
  })
})
