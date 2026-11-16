import { colourToCss } from '@/domain/gtt/colour'
import type { Palette, Pattern } from '@/domain/model/pattern'
import type { DraftRow, DraftSymbol } from '@/domain/weavingDraft'
import { expandDraftRows, rowLabel } from '@/domain/weavingDraft'

import styles from './DraftChart.module.css'

export interface DraftChartProps {
  pattern: Pattern
  /** Rows from `computeDraftRows`/`useDraftRows` for this pattern. */
  rows: DraftRow[]
  /** How many times to repeat the whole pattern (1–4). */
  repetitions?: number
  showSetup?: boolean
  showHeadings?: boolean
  showLegend?: boolean
  /** Denser cells for the live preview panel in the Edit Pattern page. */
  compact?: boolean
}

/** Resolves a palette index to a CSS colour, or undefined for an unset slot. */
function paletteColour(palette: Palette, index: number | undefined): string | undefined {
  if (index === undefined) return undefined
  const packed = palette.colours[index]
  return packed === undefined ? undefined : colourToCss(packed)
}

/**
 * Draws the direction stroke of `webbrief.png`: a vertical line for Idle and
 * a diagonal line for a turn. The slope comes from the domain's
 * `draftSymbol()`, so the visual and the direction table cannot drift apart.
 */
function SymbolStroke({ symbol }: { symbol: DraftSymbol }) {
  const line = {
    '|': { x1: 5, y1: 0, x2: 5, y2: 10 },
    '\\': { x1: 0, y1: 0, x2: 10, y2: 10 },
    '/': { x1: 0, y1: 10, x2: 10, y2: 0 },
  }[symbol]

  return (
    <svg className={styles.stroke} viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true">
      <line {...line} />
    </svg>
  )
}

/**
 * Shared renderer for the thread-path chart of `webbrief.png`. Used by both
 * the full Weaving Draft page (Stage 3) and the live preview panel in the
 * Edit Pattern page (Stage 4), so the two views can never disagree about how
 * a pick is visualised.
 */
export function DraftChart({
  pattern,
  rows,
  repetitions = 1,
  showSetup = true,
  showHeadings = true,
  showLegend = true,
  compact = false,
}: DraftChartProps) {
  const expandedRows = expandDraftRows(rows, repetitions)
  const maxHoles = Math.max(0, ...pattern.cards.map((card) => card.holes))
  const holeRows = Array.from({ length: maxHoles }, (_, i) => i)

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ''}`}>
      {showSetup && (
        <section className={styles.chartSection}>
          {showHeadings && <h2 className={styles.sectionTitle}>Threading &amp; setup</h2>}
          <div className={styles.tableWrapper}>
            <table className={`${styles.chartTable} ${styles.setupTable}`}>
              <thead>
                <tr>
                  <th className={styles.rowHeader} />
                  {pattern.cards.map((card) => (
                    <th key={card.number} className={styles.columnHeader}>{card.number}</th>
                  ))}
                </tr>
                <tr>
                  <th className={styles.rowHeader}>Thrd</th>
                  {pattern.cards.map((card) => (
                    <th key={card.number} className={styles.threadingHeader}>{card.threading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holeRows.map((holeIndex) => (
                  <tr key={holeIndex}>
                    <th className={styles.rowHeader}>{rowLabel(holeIndex)}</th>
                    {pattern.cards.map((card) => {
                      const colour = paletteColour(pattern.palette, card.holeColours[holeIndex])
                      return (
                        <td key={card.number} className={styles.chartCell}>
                          <div
                            className={`${styles.colourCell} ${colour ? '' : styles.unsetCell}`}
                            style={colour ? { background: colour } : undefined}
                            title={`Card ${card.number}, hole ${rowLabel(holeIndex)}`}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={styles.chartSection}>
        {showHeadings && <h2 className={styles.sectionTitle}>Weaving draft</h2>}
        {expandedRows.length === 0 ? (
          <p className={styles.emptyNote}>Add picks in the Edit pattern view to see the weaving draft.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={`${styles.chartTable} ${styles.draftTable}`}>
              <thead>
                <tr>
                  <th className={styles.rowHeader}>Pick</th>
                  {pattern.cards.map((card) => (
                    <th key={card.number} className={styles.columnHeader}>{card.number}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expandedRows.map((entry, index) => {
                  const isRepeatBoundary = index > 0 && expandedRows[index - 1].repeatIndex !== entry.repeatIndex
                  return (
                    <tr key={index} className={isRepeatBoundary ? styles.repeatBoundary : ''}>
                      <th className={styles.rowHeader} title={`Pick ${entry.row.pickIndex}`}>
                        {entry.row.label}
                      </th>
                      {entry.row.cards.map((cell) => {
                        const colour = paletteColour(pattern.palette, cell.colourIndex)
                        return (
                          <td key={cell.cardNumber} className={styles.chartCell}>
                            <div
                              className={`${styles.colourCell} ${colour ? '' : styles.unsetCell}`}
                              style={colour ? { background: colour } : undefined}
                              title={`Pick ${entry.row.pickIndex}, card ${cell.cardNumber}, ${cell.symbol}`}
                            >
                              <SymbolStroke symbol={cell.symbol} />
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {showLegend && (
          <div className={styles.legend}>
            <h3>Symbols</h3>
            <div className={styles.legendItems}>
              <span className={styles.legendItem}><span className={styles.legendGlyph}><SymbolStroke symbol="|" /></span> Idle</span>
              <span className={styles.legendItem}><span className={styles.legendGlyph}><SymbolStroke symbol={'\\'} /></span> S forward / Z backward</span>
              <span className={styles.legendItem}><span className={styles.legendGlyph}><SymbolStroke symbol="/" /></span> Z forward / S backward</span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
