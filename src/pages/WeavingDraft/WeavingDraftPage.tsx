import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useEditPatternStore } from '@/state/editPatternStore'

import styles from './WeavingDraftPage.module.css'

export interface WeavingDraftPageProps {
  /**
   * Where the "back" action should navigate to, matching which of the
   * other two states the user came from (see PROJECT-PROMPT.md: "From
   * both other states, the Weaving draft can be accessed.").
   */
  backTo: 'edit' | 'selection'
}

/**
 * "Weaving draft" state (see PROJECT-PROMPT.md "Frontend" / "Weaving
 * draft"). This is currently a Stage 1 stub: it loads the pattern and
 * shows its name/card count so the route is functional and the app
 * builds/runs end-to-end. Full draft rendering (picks-as-rows grid with
 * diagonal threading/turn symbols, legend, A4 print stylesheet) is Stage 3
 * scope and will replace this body without changing the route contract.
 */
export function WeavingDraftPage({ backTo }: WeavingDraftPageProps) {
  const { patternId } = useParams<{ patternId: string }>()
  const navigate = useNavigate()
  const { pattern, loading, error, load } = useEditPatternStore()

  useEffect(() => {
    if (patternId) void load(patternId)
  }, [load, patternId])

  const backPath = backTo === 'edit' ? `/pattern/${patternId}` : '/'
  const backLabel = backTo === 'edit' ? '← Back to Edit pattern' : '← Back to Pattern selection'

  if (loading) {
    return (
      <main className={styles.page}>
        <p>Loading…</p>
      </main>
    )
  }

  if (error || !pattern) {
    return (
      <main className={`${styles.page} twine-app-chrome`}>
        <p className={styles.errorText}>{error ?? 'Pattern not found.'}</p>
        <button type="button" onClick={() => navigate('/')}>
          ← Pattern selection
        </button>
      </main>
    )
  }

  return (
    <main className={`${styles.page} twine-app-chrome`}>
      <header className={styles.header}>
        <button type="button" onClick={() => navigate(backPath)} className={styles.backButton}>
          {backLabel}
        </button>
        <h1>{pattern.name}</h1>
      </header>

      <p className={styles.placeholderNote}>
        Weaving draft rendering (picks grid, threading/turn symbols, legend, print layout) is not implemented yet.
        This pattern has {pattern.cards.length} card(s) and {pattern.picks.length} pick(s).
      </p>
    </main>
  )
}
