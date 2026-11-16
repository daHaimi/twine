import type { Pattern, Pick, Threading } from '@/domain/model/pattern'
import { resolveCardDelta } from '@/domain/simulation'

/**
 * Weaving-draft rendering model.
 *
 * The draft is a thread-path chart in the style of `webbrief.png`: each row
 * is one pick (labelled A, B, C, … like the hole positions in the reference
 * chart), each column is a card, the cell fill is the colour of the thread
 * currently at that card's weaving position, and a diagonal/vertical stroke
 * shows the direction that card turns in that pick.
 *
 * All format knowledge here is pure and framework-agnostic so it can be
 * unit/fuzz-tested independently of the React view. Stage 4 adds a
 * cache-friendly incremental recompute path used by the live preview in the
 * Edit Pattern page.
 */

/** Direction stroke for one thread segment, per PROJECT-PROMPT.md's table. */
export type DraftSymbol = '\\' | '/' | '|'

/** One card's thread in one draft row. */
export interface DraftCardCell {
  cardNumber: number
  threading: Threading
  /**
   * Net hole-rotation delta for this card in this pick:
   * `0` = Idle, `> 0` = Forward, `< 0` = Backward.
   */
  delta: number
  /** Direction stroke derived from `threading` and `delta`. */
  symbol: DraftSymbol
  /** Action text shown inside the cell: F/B/. plus the hole count for multi-hole turns. */
  actionLabel: string
  /** Palette index of the thread at the weaving position (undefined = unset). */
  colourIndex: number | undefined
  /**
   * Card position (0..holes-1) *after* this pick. This makes a row a complete
   * seed for recomputing subsequent rows, which is what enables the
   * incremental path below (no need to replay the whole pick list).
   */
  positionAfter: number
}

/** One pick of the draft, with one cell per card. */
export interface DraftRow {
  /** 1-based pick index. */
  pickIndex: number
  /** A/B/C… label, cycling per hole position (webbrief.png style). */
  label: string
  /** Per-card cells, ordered by card number. */
  cards: DraftCardCell[]
}

/** A draft row together with which displayed repetition of the pattern it belongs to. */
export interface ExpandedDraftRow {
  row: DraftRow
  /** 0-based repetition index; the UI draws a thicker separator when this changes. */
  repeatIndex: number
}

/**
 * Maps a card's threading and its net turn direction to the draft stroke,
 * exactly per the table in PROJECT-PROMPT.md "Weaving draft":
 *
 * | Threading | Turn | Symbol |
 * |---|---|---|
 * | S | F | `\\` |
 * | Z | F | `/` |
 * | S | B | `/` |
 * | Z | B | `\\` |
 * | * | I | `|` |
 *
 * A net delta of zero covers both genuinely Idle picks and picks whose
 * turns cancel out (e.g. overlapping packs turning F1 then B1). Twists also
 * contribute zero delta, so they render as Idle — as specified for this
 * version.
 */
export function draftSymbol(threading: Threading, delta: number): DraftSymbol {
  if (delta === 0) return '|'
  const forward = delta > 0
  if (threading === 'S') return forward ? '\\' : '/'
  return forward ? '/' : '\\'
}

/**
 * Action text for a draft cell, as noted in `webbrief.png`: `F` (forward),
 * `B` (backward) or `.` (idle), with the hole count appended when more than
 * one turn must be done (e.g. `F2`, `B2`). The count comes from the absolute
 * net delta, so overlapping packs that turn the same way also show the
 * combined number; cancelling turns and twists show `.` because they have no
 * positional effect in this version.
 */
export function draftActionLabel(delta: number): string {
  if (delta === 0) return '.'
  const direction = delta > 0 ? 'F' : 'B'
  const distance = Math.abs(delta)
  return distance === 1 ? direction : `${direction}${distance}`
}

const ROW_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Row label for a hole index, following the A/B/C/D labels of webbrief.png.
 * Beyond Z the label falls back to a 1-based number.
 */
export function rowLabel(holeIndex: number): string {
  return ROW_LABELS[holeIndex] ?? String(holeIndex + 1)
}

/** Core computation: rows for picks `[fromPickIndex..]`, resuming from `initialPositions`. */
function computeRows(pattern: Pattern, fromPickIndex: number, initialPositions: readonly number[]): DraftRow[] {
  const { cards, picks, packs } = pattern
  if (cards.length === 0) return []

  const positions = [...initialPositions]
  const firstCardHoles = cards[0].holes

  return picks.slice(fromPickIndex).map((pick, offset) => {
    const pickIndex = fromPickIndex + offset
    const cells = cards.map((card, cardIndex) => {
      const delta = resolveCardDelta(card, pick, packs)
      const beforePosition = positions[cardIndex]
      const colourIndex = card.holeColours[mod(-beforePosition, card.holes)]
      const positionAfter = mod(beforePosition + delta, card.holes)
      positions[cardIndex] = positionAfter

      return {
        cardNumber: card.number,
        threading: card.threading,
        delta,
        symbol: draftSymbol(card.threading, delta),
        actionLabel: draftActionLabel(delta),
        colourIndex,
        positionAfter,
      }
    })

    return {
      pickIndex: pickIndex + 1,
      // The reference chart cycles A,B,C,D with each successive pick of a
      // 4-hole card; use the first card's hole count as the cycle length.
      label: rowLabel(pickIndex % firstCardHoles),
      cards: cells,
    }
  })
}

/**
 * Computes one draft row per pick from scratch.
 *
 * For each pick and card we reuse {@link resolveCardDelta} from the
 * simulation so pack-mode resolution (including TWINE's order-based overlap
 * extension) is identical to the logic used for GTT export. The colour shown
 * is the thread at weaving position 0 *before* that pick is applied, i.e.
 * `holeColours[(-cumulativePosition) mod holes]`.
 *
 * @returns An empty array when there are no picks or no cards.
 */
export function computeDraftRows(pattern: Pattern): DraftRow[] {
  return computeRows(pattern, 0, pattern.cards.map(() => 0))
}

/**
 * Computes only the tail of the draft, resuming from already-known positions
 * (the `positionAfter` values of the last preserved row). Used by the
 * incremental cache below; exported for direct property testing.
 */
export function computeDraftRowsFrom(
  pattern: Pattern,
  fromPickIndex: number,
  initialPositions: readonly number[],
): DraftRow[] {
  return computeRows(pattern, fromPickIndex, initialPositions)
}

/**
 * Repeats the whole pattern `repetitions` times for display. The brief allows
 * 1–4 repetitions (one by default); out-of-range values are clamped.
 */
export function expandDraftRows(rows: readonly DraftRow[], repetitions: number): ExpandedDraftRow[] {
  const count = Math.max(1, Math.min(4, Math.floor(repetitions)))
  const expanded: ExpandedDraftRow[] = []
  for (let repeatIndex = 0; repeatIndex < count; repeatIndex++) {
    for (const row of rows) {
      expanded.push({ row, repeatIndex })
    }
  }
  return expanded
}

// --- Incremental recomputation cache (Stage 4 live preview) ----------------

/** A cached draft plus the signatures used to detect what changed. */
export interface DraftCache {
  configKey: string
  pickKeys: string[]
  rows: DraftRow[]
}

/** Signature of everything that affects card positions/colours but is not a pick action. */
export function draftConfigKey(pattern: Pattern): string {
  return JSON.stringify({
    cards: pattern.cards.map((card) => [card.number, card.holes, card.threading, card.holeColours]),
    packs: pattern.packs.map((pack) => [pack.name, pack.order, pack.cardNumbers]),
    palette: pattern.palette.colours,
  })
}

/** Signature of a single pick's mode and resolved actions. */
export function draftPickKey(pick: Pick): string {
  const actions = [...pick.actions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, action]) =>
      action.type === 'Turn' ? `${key}:T${action.dir}${action.dist ?? 1}` : `${key}:W`,
    )
  return `${pick.mode}|${actions.join(',')}`
}

/** Builds a cache for a pattern (full recompute). */
export function buildDraftCache(pattern: Pattern): DraftCache {
  return {
    configKey: draftConfigKey(pattern),
    pickKeys: pattern.picks.map(draftPickKey),
    rows: computeDraftRows(pattern),
  }
}

/**
 * Refreshes a draft cache after an edit. Rows before the first changed pick
 * are reused verbatim; only the tail is recomputed from the last preserved
 * row's `positionAfter` values. A change to cards/packs/palette forces a full
 * recompute, and an unchanged pattern returns the very same cache object.
 */
export function updateDraftCache(cache: DraftCache, pattern: Pattern): DraftCache {
  const configKey = draftConfigKey(pattern)
  const pickKeys = pattern.picks.map(draftPickKey)

  if (configKey !== cache.configKey) {
    return { configKey, pickKeys, rows: computeDraftRows(pattern) }
  }

  const common = Math.min(pickKeys.length, cache.pickKeys.length)
  let firstChanged = -1
  for (let i = 0; i < common; i++) {
    if (pickKeys[i] !== cache.pickKeys[i]) {
      firstChanged = i
      break
    }
  }

  if (firstChanged === -1 && pickKeys.length === cache.pickKeys.length) {
    return cache
  }

  // No differing pick: picks were only appended or removed at the bottom.
  if (firstChanged === -1) firstChanged = common

  const prefix = cache.rows.slice(0, firstChanged)
  if (prefix.length < firstChanged) {
    // Defensive: a cache built for a different card count would be invalid
    // even with an equal config key (should not happen in practice).
    return { configKey, pickKeys, rows: computeDraftRows(pattern) }
  }

  const positions =
    prefix.length === 0 ? pattern.cards.map(() => 0) : prefix[prefix.length - 1].cards.map((c) => c.positionAfter)
  const tail = computeRows(pattern, firstChanged, positions)
  return { configKey, pickKeys, rows: [...prefix, ...tail] }
}

/** True modulo (always non-negative for a positive divisor). */
function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
