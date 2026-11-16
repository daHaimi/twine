import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { DraftChart } from '@/components/DraftChart/DraftChart'
import { PaletteSelect } from '@/components/PaletteSelect/PaletteSelect'
import { colourToCss, cssToColour } from '@/domain/gtt/colour'
import { downloadPattern } from '@/domain/gtt/io'
import type { Threading } from '@/domain/model/pattern'
import { LIMITS } from '@/domain/model/pattern'
import type { PickGesture } from '@/domain/pickAction'
import { actionLabel, gestureFromSwipe } from '@/domain/pickAction'
import { useDraftRows } from '@/hooks/useDraftRows'
import type { DestructiveChangePreview } from '@/state/editPatternStore'
import { useEditPatternStore } from '@/state/editPatternStore'

import styles from './EditPatternPage.module.css'

const HOLE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/**
 * Generic "confirm this destructive change" modal, driven by the preview
 * objects returned from the editPatternStore's `preview*` functions (see
 * that module's doc comment for why mutation is split into preview+apply).
 */
interface PendingChange {
  preview: DestructiveChangePreview
  onConfirm: () => void
}

/**
 * "Edit pattern" state (see PROJECT-PROMPT.md "Frontend" / "Edit pattern"):
 * the configuration part - Name, Palette, Cards, Packs. The picks grid
 * (Stage 2) will be added as a further section of this same page.
 */
export function EditPatternPage() {
  const { patternId } = useParams<{ patternId: string }>()
  const navigate = useNavigate()
  const {
    pattern,
    loading,
    error,
    dirty,
    load,
    save,
    setName,
    setPaletteColour,
    previewSetCardCount,
    applySetCardCount,
    previewSetCardHoles,
    applySetCardHoles,
    setCardThreading,
    setHoleColour,
    previewRemoveCard,
    applyRemoveCard,
    addPack,
    removePack,
    setPackCards,
    setPackOrder,
    addPick,
    removePick,
    previewSetCardAction,
    applySetCardAction,
    previewSetPackAction,
    applySetPackAction,
  } = useEditPatternStore()

  const [pending, setPending] = useState<PendingChange | undefined>(undefined)
  const [cardCountInput, setCardCountInput] = useState('')
  const [lastSyncedCardCount, setLastSyncedCardCount] = useState<number | undefined>(undefined)
  const [newPackName, setNewPackName] = useState('')
  const nameInputId = useId()
  const cardCountInputId = useId()
  const newPackInputId = useId()

  useEffect(() => {
    if (patternId) void load(patternId)
  }, [load, patternId])

  // Live draft preview (Stage 4): incrementally refreshed from the current
  // picks/cards, without replaying the whole pattern on every edit.
  const previewRows = useDraftRows(pattern)

  // Adjust state during render (see https://react.dev/learn/you-might-not-need-an-effect)
  // rather than useEffect, to keep cardCountInput mirroring pattern.cards.length
  // whenever the loaded pattern changes (e.g. after load() or a card-count
  // change applied elsewhere) without an extra render pass.
  if (pattern && lastSyncedCardCount !== pattern.cards.length) {
    setLastSyncedCardCount(pattern.cards.length)
    setCardCountInput(String(pattern.cards.length))
  }

  const maxHoles = useMemo(
    () => (pattern ? Math.max(LIMITS.MIN_HOLES, ...pattern.cards.map((c) => c.holes)) : LIMITS.MIN_HOLES),
    [pattern],
  )

  const requestCardCountChange = useCallback(() => {
    const newCount = Number.parseInt(cardCountInput, 10)
    if (!Number.isFinite(newCount)) return
    const preview = previewSetCardCount(newCount)
    if (!preview) {
      applySetCardCount(newCount)
      return
    }
    setPending({ preview, onConfirm: () => applySetCardCount(newCount) })
  }, [applySetCardCount, cardCountInput, previewSetCardCount])

  const requestHolesChange = useCallback(
    (cardNumber: number, newHoles: number) => {
      const preview = previewSetCardHoles(cardNumber, newHoles)
      if (!preview) {
        applySetCardHoles(cardNumber, newHoles)
        return
      }
      setPending({ preview, onConfirm: () => applySetCardHoles(cardNumber, newHoles) })
    },
    [applySetCardHoles, previewSetCardHoles],
  )

  const requestRemoveCard = useCallback(
    (cardNumber: number) => {
      const preview = previewRemoveCard(cardNumber)
      if (!preview) return
      setPending({ preview, onConfirm: () => applyRemoveCard(cardNumber) })
    },
    [applyRemoveCard, previewRemoveCard],
  )

  const requestCardAction = useCallback(
    (pickIndex: number, cardNumber: number, gesture: PickGesture = 'tap') => {
      const preview = previewSetCardAction(pickIndex, cardNumber)
      if (!preview) {
        applySetCardAction(pickIndex, cardNumber, gesture)
        return
      }
      setPending({ preview, onConfirm: () => applySetCardAction(pickIndex, cardNumber, gesture) })
    },
    [applySetCardAction, previewSetCardAction],
  )

  const requestPackAction = useCallback(
    (pickIndex: number, packName: string, gesture: PickGesture = 'tap') => {
      const preview = previewSetPackAction(pickIndex, packName)
      if (!preview) {
        applySetPackAction(pickIndex, packName, gesture)
        return
      }
      setPending({ preview, onConfirm: () => applySetPackAction(pickIndex, packName, gesture) })
    },
    [applySetPackAction, previewSetPackAction],
  )

  const confirmPending = useCallback(() => {
    pending?.onConfirm()
    setPending(undefined)
  }, [pending])

  // Swipe-gesture tracking for the Picks grid (see PROJECT-PROMPT.md: "swiping
  // up/down to turn forward/backward, swiping sideways to twist"). A plain
  // tap/click (zero or near-zero movement between pointerdown and pointerup)
  // falls back to the full cycleAction cycle via gestureFromSwipe's default
  // threshold - see src/domain/pickAction.ts.
  const pointerStart = useRef<{ x: number; y: number } | undefined>(undefined)
  const suppressNextClick = useRef(false)

  const handlePickPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    pointerStart.current = { x: e.clientX, y: e.clientY }
  }

  /**
   * Only a genuine swipe (classified as anything other than `'tap'`) is
   * handled here directly and flagged to suppress the browser's own
   * synthetic `click` event that can still follow a mouse drag; a plain
   * tap/click is left for the element's normal `onClick` handler (which
   * covers keyboard activation too) so we don't double-apply the gesture.
   */
  const handlePickPointerUp = (e: PointerEvent<HTMLButtonElement>, onGesture: (gesture: PickGesture) => void) => {
    const start = pointerStart.current ?? { x: e.clientX, y: e.clientY }
    pointerStart.current = undefined
    const gesture = gestureFromSwipe(e.clientX - start.x, e.clientY - start.y)
    if (gesture === 'tap') return
    suppressNextClick.current = true
    onGesture(gesture)
  }

  const handlePickClick = (onGesture: (gesture: PickGesture) => void) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    onGesture('tap')
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <p>Loading…</p>
      </main>
    )
  }

  if (error || !pattern) {
    return (
      <main className={styles.page}>
        <p className={styles.errorText}>{error ?? 'Pattern not found.'}</p>
        <button type="button" onClick={() => navigate('/')}>
          Back to Pattern selection
        </button>
      </main>
    )
  }

  return (
    <main className={`${styles.page} twine-app-chrome`}>
      <header className={styles.header}>
        <button type="button" onClick={() => navigate('/')} className={styles.backButton}>
          ← Pattern selection
        </button>
        <div className={styles.nameRow}>
          <label htmlFor={nameInputId} className={styles.visuallyHidden}>
            Pattern name
          </label>
          <input
            id={nameInputId}
            type="text"
            value={pattern.name}
            onChange={(e) => setName(e.target.value)}
            className={styles.nameInput}
          />
          {dirty && <span className={styles.dirtyBadge}>Unsaved changes</span>}
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => void save()} className={styles.primaryButton}>
            Save
          </button>
          <button type="button" onClick={() => downloadPattern(pattern)}>
            Download
          </button>
          <button type="button" onClick={() => navigate(`/pattern/${pattern.id}/draft`)}>
            Weaving draft →
          </button>
        </div>
      </header>

      <section aria-labelledby="palette-heading" className={styles.section}>
        <h2 id="palette-heading">Palette</h2>
        <div className={styles.paletteGrid}>
          {pattern.palette.colours.slice(1).map((packed, i) => {
            const index = i + 1
            return (
              <div key={index} className={styles.paletteSlot}>
                <span className={styles.paletteIndex}>{index}</span>
                <input
                  type="color"
                  value={packed !== undefined ? colourToCss(packed) : '#ffffff'}
                  disabled={packed === undefined}
                  onChange={(e) => setPaletteColour(index, cssToColour(e.target.value))}
                  aria-label={`Palette colour ${index}`}
                />
                <label className={styles.unsetLabel}>
                  <input
                    type="checkbox"
                    checked={packed === undefined}
                    onChange={(e) => setPaletteColour(index, e.target.checked ? undefined : 0x000000)}
                  />
                  Unset
                </label>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="cards-heading" className={styles.section}>
        <h2 id="cards-heading">Cards</h2>
        <div className={styles.cardCountRow}>
          <label htmlFor={cardCountInputId}>Card count</label>
          <input
            id={cardCountInputId}
            type="number"
            min={0}
            max={LIMITS.MAX_CARDS}
            value={cardCountInput}
            onChange={(e) => setCardCountInput(e.target.value)}
          />
          <button type="button" onClick={requestCardCountChange}>
            Apply
          </button>
        </div>

        <div className={styles.cardsTableWrapper}>
          <table className={styles.cardsTable}>
            <thead>
              <tr>
                <th scope="row">Card</th>
                {pattern.cards.map((card) => (
                  <th key={card.number} scope="col">
                    {card.number}
                  </th>
                ))}
              </tr>
              <tr>
                <th scope="row">Threading</th>
                {pattern.cards.map((card) => (
                  <td key={card.number}>
                    <select
                      value={card.threading}
                      aria-label={`Card ${card.number} threading`}
                      onChange={(e) => setCardThreading(card.number, e.target.value as Threading)}
                    >
                      <option value="S">S</option>
                      <option value="Z">Z</option>
                    </select>
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Holes</th>
                {pattern.cards.map((card) => (
                  <td key={card.number}>
                    <input
                      type="number"
                      min={LIMITS.MIN_HOLES}
                      max={LIMITS.MAX_HOLES}
                      value={card.holes}
                      aria-label={`Card ${card.number} holes`}
                      className={styles.holesInput}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10)
                        if (Number.isFinite(n)) requestHolesChange(card.number, n)
                      }}
                    />
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxHoles }, (_, holeIdx) => (
                <tr key={holeIdx}>
                  <th scope="row">Hole {HOLE_LETTERS[holeIdx] ?? holeIdx + 1}</th>
                  {pattern.cards.map((card) => {
                    if (holeIdx >= card.holes) {
                      return <td key={card.number} className={styles.naCell} aria-hidden="true" />
                    }
                    const holeLabel = HOLE_LETTERS[holeIdx] ?? String(holeIdx + 1)
                    return (
                      <td key={card.number}>
                        <PaletteSelect
                          palette={pattern.palette}
                          value={card.holeColours[holeIdx]}
                          onChange={(index) => setHoleColour(card.number, holeIdx, index)}
                          label={`Card ${card.number} hole ${holeLabel} colour`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" aria-label="Remove card" />
                {pattern.cards.map((card) => (
                  <td key={card.number}>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => requestRemoveCard(card.number)}
                      aria-label={`Remove card ${card.number}`}
                    >
                      ✕
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="packs-heading" className={styles.section}>
        <h2 id="packs-heading">Packs</h2>
        <ul className={styles.packList}>
          {pattern.packs.map((pack) => (
            <li key={pack.name} className={styles.packItem}>
              <div className={styles.packHeader}>
                <strong>{pack.name}</strong>
                <label>
                  Order
                  <input
                    type="number"
                    value={pack.order}
                    onChange={(e) => setPackOrder(pack.name, Number.parseInt(e.target.value, 10) || 0)}
                    className={styles.orderInput}
                  />
                </label>
                <button type="button" className={styles.dangerButton} onClick={() => removePack(pack.name)}>
                  Remove pack
                </button>
              </div>
              <div className={styles.cardChips}>
                {pattern.cards.map((card) => {
                  const checked = pack.cardNumbers.includes(card.number)
                  return (
                    <label key={card.number} className={styles.cardChip}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...pack.cardNumbers, card.number].sort((a, b) => a - b)
                            : pack.cardNumbers.filter((n) => n !== card.number)
                          setPackCards(pack.name, next)
                        }}
                      />
                      {card.number}
                    </label>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
        <div className={styles.createNew}>
          <label htmlFor={newPackInputId} className={styles.visuallyHidden}>
            New pack name
          </label>
          <input
            id={newPackInputId}
            type="text"
            placeholder="New pack name"
            value={newPackName}
            onChange={(e) => setNewPackName(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              const name = newPackName.trim()
              if (!name || pattern.packs.some((p) => p.name === name)) return
              addPack(name)
              setNewPackName('')
            }}
          >
            Add pack
          </button>
        </div>
      </section>

      <section aria-labelledby="picks-heading" className={styles.section}>
        <h2 id="picks-heading">Picks</h2>
        <div className={styles.picksLayout}>
          <div className={styles.picksTableArea}>
            <div className={styles.cardsTableWrapper}>
              <table className={styles.cardsTable}>
                <thead>
                  <tr>
                    <th scope="row">Pick</th>
                    {pattern.cards.map((card) => (
                      <th key={`c${card.number}`} scope="col">
                        Card {card.number}
                      </th>
                    ))}
                    {pattern.packs.map((pack) => (
                      <th key={`p${pack.name}`} scope="col">
                        {pack.name}
                      </th>
                    ))}
                    <th scope="col" aria-label="Remove pick" />
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Start</th>
                    {pattern.cards.map((card) => {
                      const packed = card.holeColours[0]
                      return (
                        <td key={`c${card.number}`}>
                          <span
                            aria-label={`Card ${card.number} starting colour`}
                            className={packed !== undefined ? styles.holeCell : `${styles.holeCell} ${styles.holeCellUnset}`}
                            style={{ background: packed !== undefined ? colourToCss(packed) : undefined }}
                          >
                            {packed ?? ''}
                          </span>
                        </td>
                      )
                    })}
                    {pattern.packs.map((pack) => (
                      <td key={`p${pack.name}`} className={styles.naCell} aria-hidden="true" />
                    ))}
                    <td />
                  </tr>
                  {pattern.picks.map((pick, pickIndex) => (
                    <tr key={pickIndex}>
                      <th scope="row">{pickIndex + 1}</th>
                      {pattern.cards.map((card) => {
                        const isActiveMode = pick.mode === 'Card'
                        const action = isActiveMode ? pick.actions.get(String(card.number)) : undefined
                        return (
                          <td key={`c${card.number}`}>
                            <button
                              type="button"
                              aria-label={`Pick ${pickIndex + 1} card ${card.number} action`}
                              className={isActiveMode ? styles.pickCellActive : styles.pickCellInactive}
                              onPointerDown={handlePickPointerDown}
                              onPointerUp={(e) =>
                                handlePickPointerUp(e, (gesture) => requestCardAction(pickIndex, card.number, gesture))
                              }
                              onClick={() => handlePickClick((gesture) => requestCardAction(pickIndex, card.number, gesture))}
                            >
                              {isActiveMode ? actionLabel(action) : '—'}
                            </button>
                          </td>
                        )
                      })}
                      {pattern.packs.map((pack) => {
                        const isActiveMode = pick.mode === 'Pack'
                        const action = isActiveMode ? pick.actions.get(pack.name) : undefined
                        return (
                          <td key={`p${pack.name}`}>
                            <button
                              type="button"
                              aria-label={`Pick ${pickIndex + 1} pack ${pack.name} action`}
                              className={isActiveMode ? styles.pickCellActive : styles.pickCellInactive}
                              onPointerDown={handlePickPointerDown}
                              onPointerUp={(e) =>
                                handlePickPointerUp(e, (gesture) => requestPackAction(pickIndex, pack.name, gesture))
                              }
                              onClick={() => handlePickClick((gesture) => requestPackAction(pickIndex, pack.name, gesture))}
                            >
                              {isActiveMode ? actionLabel(action) : '—'}
                            </button>
                          </td>
                        )
                      })}
                      <td>
                        {pickIndex === pattern.picks.length - 1 && (
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() => removePick(pickIndex)}
                            aria-label={`Remove pick ${pickIndex + 1}`}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addPick} disabled={pattern.picks.length >= LIMITS.MAX_PICKS}>
              Add pick
            </button>
          </div>

          <aside className={styles.previewPanel} aria-labelledby="draft-preview-heading">
            <h3 id="draft-preview-heading">Live draft preview</h3>
            <p className={styles.previewHint}>Updates as you edit the picks.</p>
            <DraftChart
              pattern={pattern}
              rows={previewRows}
              showSetup={false}
              showHeadings={false}
              showLegend={false}
              compact
            />
            <button type="button" onClick={() => navigate(`/pattern/${pattern.id}/draft`)}>
              Open full draft →
            </button>
          </aside>
        </div>
      </section>

      {pending && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Confirm change">
          <div className={styles.modal}>
            <p>{pending.preview.message}</p>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setPending(undefined)}>
                Cancel
              </button>
              <button type="button" className={styles.dangerButton} onClick={confirmPending}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
