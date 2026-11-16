import { useEffect, useLayoutEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { DraftChart } from '@/components/DraftChart/DraftChart'
import { useDraftRows } from '@/hooks/useDraftRows'
import { useEditPatternStore } from '@/state/editPatternStore'

import './print.css'
import styles from './WeavingDraftPage.module.css'

export interface WeavingDraftPageProps {
  backTo: 'edit' | 'selection'
}

/** Commonly used A4 margin presets (mm on every side). */
const PAGE_MARGIN_PRESETS = [
  { label: 'None (0 mm)', mm: 0 },
  { label: 'Narrow (10 mm)', mm: 10 },
  { label: 'Normal (20 mm)', mm: 20 },
  { label: 'Moderate (25 mm)', mm: 25 },
  { label: 'Wide (30 mm)', mm: 30 },
] as const

const DEFAULT_MARGIN_MM = 20
const MARGIN_STYLE_ID = 'twine-draft-page-margin'

/**
 * "Weaving draft" state: renders the shared thread-path chart of
 * `webbrief.png` with a 1–4 repetition control, selectable A4 page margins
 * and a print action.
 * Rendering itself lives in `components/DraftChart` so the live preview in
 * the Edit Pattern page (Stage 4) shows exactly the same thing.
 */
export function WeavingDraftPage({ backTo }: WeavingDraftPageProps) {
  const { patternId } = useParams<{ patternId: string }>()
  const navigate = useNavigate()
  const { pattern, loading, error, load } = useEditPatternStore()

  const [repetitions, setRepetitions] = useState(1)
  const [marginMm, setMarginMm] = useState<number>(DEFAULT_MARGIN_MM)
  const draftRows = useDraftRows(pattern)

  // `@page` cannot read CSS custom properties in Chromium, and some browsers
  // ignore @page rules from <style> elements in <body> — keep the generated
  // rule in <head> so every browser's print pipeline sees it.
  useLayoutEffect(() => {
    let style = document.getElementById(MARGIN_STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = MARGIN_STYLE_ID
      style.setAttribute('data-testid', 'draft-page-margin-rule')
      document.head.appendChild(style)
    }
    style.textContent = `@page { size: A4 portrait; margin: ${marginMm}mm; }`
    return () => style?.remove()
  }, [marginMm])

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
          <label className={styles.repetitionControl}>
            Margins:
            <select
              value={marginMm}
              onChange={(event) => setMarginMm(Number(event.target.value))}
              className={styles.select}
            >
              {PAGE_MARGIN_PRESETS.map((preset) => (
                <option key={preset.mm} value={preset.mm}>{preset.label}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => window.print()} className={styles.printButton}>
            Print
          </button>
        </div>
        <p className={`${styles.printHint} twine-draft-noprint`}>
          If the print preview shows no margins, set your browser's print-dialog margins to “Default” (not “None”).
        </p>
      </header>

      <section className={styles.chartSection}>
        <DraftChart pattern={pattern} rows={draftRows} repetitions={repetitions} />
      </section>
    </main>
  )
}
