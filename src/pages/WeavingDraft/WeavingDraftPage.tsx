import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { DraftChart } from '@/components/DraftChart/DraftChart'
import { useDraftRows } from '@/hooks/useDraftRows'
import { useEditPatternStore } from '@/state/editPatternStore'

import './print.css'
import styles from './WeavingDraftPage.module.css'

export interface WeavingDraftPageProps {
  backTo: 'edit' | 'selection'
}

/**
 * "Weaving draft" state: renders the shared thread-path chart of
 * `webbrief.png` with a 1–4 repetition control and an A4 print action.
 * Rendering itself lives in `components/DraftChart` so the live preview in
 * the Edit Pattern page (Stage 4) shows exactly the same thing.
 */
export function WeavingDraftPage({ backTo }: WeavingDraftPageProps) {
  const { patternId } = useParams<{ patternId: string }>()
  const navigate = useNavigate()
  const { pattern, loading, error, load } = useEditPatternStore()

  const [repetitions, setRepetitions] = useState(1)
  const draftRows = useDraftRows(pattern)

  useEffect(() => {
    if (patternId) void load(patternId)
  }, [load, patternId])

  const backPath = backTo === 'edit' ? `/pattern/${patternId}` : '/'
  const backLabel = backTo === 'edit' ? '← Back to Edit pattern' : '← Back to Pattern selection'

  if (loading) {
    return (
      <main className={`${styles.page} twine-draft-page`}>
        <p>Loading…</p>
      </main>
    )
  }

  if (error || !pattern) {
    return (
      <main className={`${styles.page} twine-app-chrome`}>
        <p className={styles.errorText}>{error ?? 'Pattern not found.'}</p>
        <button type="button" onClick={() => navigate('/')}>← Pattern selection</button>
      </main>
    )
  }

  return (
    <main className={`${styles.page} twine-draft-page`}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className={`${styles.backButton} twine-draft-noprint`}
          >
            {backLabel}
          </button>
          <h1>{pattern.name}</h1>
        </div>
        <div className={`${styles.controls} twine-draft-noprint`}>
          <label className={styles.repetitionControl}>
            Repetitions:
            <select
              value={repetitions}
              onChange={(event) => setRepetitions(Number(event.target.value))}
              className={styles.select}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => window.print()} className={styles.printButton}>
            Print
          </button>
        </div>
      </header>

      <section className={styles.chartSection}>
        <DraftChart pattern={pattern} rows={draftRows} repetitions={repetitions} />
      </section>
    </main>
  )
}
