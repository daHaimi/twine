import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

/**
 * This suite only verifies that App.tsx's router maps each URL to the
 * right page component with the right props (see App.tsx's doc comment for
 * the intended route table) - full page behavior is already covered by
 * EditPatternPage.test.tsx, WeavingDraftPage.test.tsx and
 * PatternSelectionPage.test.tsx. Mocking the page components here avoids
 * pulling in IndexedDB/store side effects, and sidesteps the fact that
 * `createBrowserRouter` captures `window.location` only once per module
 * evaluation (so exercising multiple routes requires `vi.resetModules()` +
 * a fresh dynamic `import('@/app/App')` per test).
 */
vi.mock('@/pages/PatternSelection/PatternSelectionPage', () => ({
  PatternSelectionPage: () => <div>PatternSelectionPage stub</div>,
}))
vi.mock('@/pages/EditPattern/EditPatternPage', () => ({
  EditPatternPage: () => <div>EditPatternPage stub</div>,
}))
vi.mock('@/pages/WeavingDraft/WeavingDraftPage', () => ({
  WeavingDraftPage: ({ backTo }: { backTo: 'edit' | 'selection' }) => <div>WeavingDraftPage stub (backTo={backTo})</div>,
}))

async function renderAppAt(path: string) {
  act(() => {
    window.history.replaceState(null, '', path)
  })
  vi.resetModules()
  const { App } = await import('@/app/App')
  return render(<App />)
}

describe('App routing', () => {
  it('renders the Pattern selection page at "/"', async () => {
    await renderAppAt('/')
    expect(await screen.findByText('PatternSelectionPage stub')).toBeInTheDocument()
  })

  it('redirects unknown paths back to "/"', async () => {
    await renderAppAt('/this/does/not/exist')
    expect(await screen.findByText('PatternSelectionPage stub')).toBeInTheDocument()
  })

  it('renders the Edit pattern page for /pattern/:patternId', async () => {
    await renderAppAt('/pattern/some-id')
    expect(await screen.findByText('EditPatternPage stub')).toBeInTheDocument()
  })

  it('renders the Weaving draft page with backTo="edit" for /pattern/:patternId/draft', async () => {
    await renderAppAt('/pattern/some-id/draft')
    expect(await screen.findByText(/WeavingDraftPage stub \(backTo=edit\)/)).toBeInTheDocument()
  })

  it('renders the Weaving draft page with backTo="selection" for /draft/:patternId', async () => {
    await renderAppAt('/draft/some-id')
    expect(await screen.findByText(/WeavingDraftPage stub \(backTo=selection\)/)).toBeInTheDocument()
  })
})
