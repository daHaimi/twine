import type { Action, Card, Pack, Pick } from '@/domain/model/pattern'

/**
 * Card-state simulation.
 *
 * `CurThread`, `CurPos` and `CurHoles` in the GTT format are a *cached
 * mirror* of the simulated weaving state, not source-of-truth data (see
 * PROJECT-PROMPT.md). TWINE always ignores these fields on import and
 * recomputes them purely from a card's `Holes`, `Threading`, and the
 * pattern's `Picks`. This module implements that recomputation.
 *
 * Simulation model:
 * - `CurPos` is the net accumulated hole-rotation offset, modulo the card's
 *   hole count: each `Turn` with `Dir="F"` advances the position by `Dist`
 *   holes, `Dir="B"` retreats it by `Dist` holes, `Dir="I"` (idle) and any
 *   card/pack not mentioned in a pick leaves it unchanged.
 * - `Twist` actions have no positional effect in this version (their visual
 *   effect is not yet modeled; see PROJECT-PROMPT.md "Picks" section), so
 *   they contribute a delta of 0.
 * - `CurThread` always mirrors the card's static `Threading`, since twists
 *   (the only thing that could flip it) are not modeled in this version.
 * - `CurHoles[i]` is defined as `holeColours[(i - pos) mod holes]`: the
 *   colour originally threaded through hole `(i - pos) mod holes` is the
 *   one now presented at position `i` after `pos` net forward turns. This
 *   is an internally-consistent convention (reversible, and stable across
 *   repeated turns); since `CurHoles`/`CurPos` are write-only cache fields
 *   TWINE itself never reads back, the exact rotation direction convention
 *   is a documented implementation choice rather than a format requirement.
 *
 * Pack-mode resolution: when a pick's mode is `'Pack'`, a card's net delta
 * for that pick is the *cumulative sum* of the deltas contributed by every
 * pack (containing that card) which has an explicit action in the pick,
 * applied in ascending `Pack.order` (TWINE's pack-overlap extension; see
 * PROJECT-PROMPT.md). A card covered by no such pack defaults to Idle
 * (delta 0) for that pick.
 */

/** Net hole-rotation delta contributed by a single Turn action (0 for Twist/Idle). */
function actionDelta(action: Action): number {
  if (action.type !== 'Turn') {
    // Twist has no modeled positional effect in this version.
    return 0
  }
  const dist = action.dist ?? 1
  switch (action.dir) {
    case 'F':
      return dist
    case 'B':
      return -dist
    case 'I':
    default:
      return 0
  }
}

/**
 * Computes the net rotation delta for `card` contributed by a single
 * `pick`, resolving Pack-mode cumulative overlap per TWINE's extension.
 */
export function resolveCardDelta(card: Card, pick: Pick, packs: readonly Pack[]): number {
  if (pick.mode === 'Card') {
    const action = pick.actions.get(String(card.number))
    return action ? actionDelta(action) : 0
  }

  // Pack mode: sum deltas from every pack covering this card that has an
  // explicit action in this pick, processed in ascending Order.
  const coveringPacks = packs
    .filter((pack) => pack.cardNumbers.includes(card.number) && pick.actions.has(pack.name))
    .sort((a, b) => a.order - b.order)

  let total = 0
  for (const pack of coveringPacks) {
    const action = pick.actions.get(pack.name)
    if (action) {
      total += actionDelta(action)
    }
  }
  return total
}

/** Result of simulating a card's state through all picks. */
export interface CardSimulationResult {
  curThread: Card['threading']
  curPos: number
  curHoles: (number | undefined)[]
}

/**
 * Simulates `card`'s state after the final pick of `picks`, resolving
 * Pack-mode picks against `packs`.
 */
export function simulateCard(card: Card, picks: readonly Pick[], packs: readonly Pack[]): CardSimulationResult {
  const holes = card.holes

  let pos = 0
  for (const pick of picks) {
    const delta = resolveCardDelta(card, pick, packs)
    pos = mod(pos + delta, holes)
  }

  const curHoles = Array.from({ length: holes }, (_, i) => card.holeColours[mod(i - pos, holes)])

  return {
    curThread: card.threading,
    curPos: pos,
    curHoles,
  }
}

/** Simulates every card in `cards` against `picks`/`packs`. */
export function simulateAllCards(
  cards: readonly Card[],
  picks: readonly Pick[],
  packs: readonly Pack[],
): Map<number, CardSimulationResult> {
  const result = new Map<number, CardSimulationResult>()
  for (const card of cards) {
    result.set(card.number, simulateCard(card, picks, packs))
  }
  return result
}

/** True modulo (always non-negative for a positive divisor), unlike JS's `%`. */
function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
