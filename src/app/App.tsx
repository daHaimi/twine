import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import { EditPatternPage } from '@/pages/EditPattern/EditPatternPage'
import { PatternSelectionPage } from '@/pages/PatternSelection/PatternSelectionPage'
import { WeavingDraftPage } from '@/pages/WeavingDraft/WeavingDraftPage'

/**
 * Top-level router mapping URLs onto TWINE's 3 frontend states (see
 * PROJECT-PROMPT.md "Frontend"):
 *   /                      -> Pattern selection (no current file selected)
 *   /pattern/:patternId    -> Edit pattern (a current file is selected)
 *   /pattern/:patternId/draft -> Weaving draft, reached from Edit pattern
 *   /draft/:patternId      -> Weaving draft, reached directly from the
 *                             selection list without entering edit mode
 *
 * Both draft routes render the same `WeavingDraftPage`; the distinction is
 * only in which page a "back" action returns to, matching "From both other
 * states, the Weaving draft can be accessed."
 */
const router = createBrowserRouter([
  { path: '/', element: <PatternSelectionPage /> },
  { path: '/pattern/:patternId', element: <EditPatternPage /> },
  { path: '/pattern/:patternId/draft', element: <WeavingDraftPage backTo="edit" /> },
  { path: '/draft/:patternId', element: <WeavingDraftPage backTo="selection" /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

export function App() {
  return <RouterProvider router={router} />
}
