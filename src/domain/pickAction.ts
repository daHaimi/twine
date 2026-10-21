import type { Action } from '@/domain/model/pattern'

/**
 * Pure cycling logic for a single pick-grid cell's action, used to drive the
 * "click/tap a cell to cycle it" interaction described in PROJECT-PROMPT.md
 * ("For each interaction, choose the most intuitive way of human input.").
 *
 * A single click/tap steps through every representable action in one
 * self-contained 6-state cycle, so no secondary gesture/control is needed
 * to reach every state with just one interaction primitive (important for
 * touch, where a second "modifier" gesture would be awkward):
 *
 *   Idle (no entry) -> Turn F dist 1 -> Turn F dist 2 -> Turn B dist 1 ->
 *   Turn B dist 2 -> Twist -> back to Idle
 */
const CYCLE: readonly (Action | undefined)[] = [
  undefined,
  { type: 'Turn', dir: 'F', dist: 1 },
  { type: 'Turn', dir: 'F', dist: 2 },
  { type: 'Turn', dir: 'B', dist: 1 },
  { type: 'Turn', dir: 'B', dist: 2 },
  { type: 'Twist', dir: 'V' },
]

function cycleIndexOf(current: Action | undefined): number {
  if (current === undefined) return 0
  if (current.type === 'Twist') return 5
  const dist = current.dist ?? 1
  if (current.dir === 'F') return dist === 2 ? 2 : 1
  if (current.dir === 'B') return dist === 2 ? 4 : 3
  return 0 // Idle Turn (dir 'I'), not normally stored, but handled defensively.
}

export function cycleAction(current: Action | undefined): Action | undefined {
  const next = CYCLE[(cycleIndexOf(current) + 1) % CYCLE.length]
  return next ? { ...next } : undefined
}

/**
 * The classified gesture driving a pick-grid cell's action, per
 * PROJECT-PROMPT.md: "swiping up/down to turn forward/backward, swiping
 * sideways to twist" (touch), with a plain tap/click reaching every state
 * via `cycleAction` (mouse, or touch without a directional swipe).
 */
export type PickGesture = 'tap' | 'up' | 'down' | 'sideways'

/**
 * Applies a classified gesture to a cell's current action.
 *
 * - `'tap'` delegates to {@link cycleAction} (the full 6-state cycle).
 * - `'up'`/`'down'` are direct forward/backward shortcuts: swiping
 *   up/down from any non-matching state jumps straight to `F1`/`B1`;
 *   repeating the same swipe advances `F1 -> F2` / `B1 -> B2`, and
 *   repeating it once more wraps back to Idle - so a cell can be fully
 *   cleared with the same gesture that set it, without needing a tap.
 * - `'sideways'` toggles `Twist` on/off, discarding any prior Turn state.
 */
export function applyGesture(current: Action | undefined, gesture: PickGesture): Action | undefined {
  if (gesture === 'tap') return cycleAction(current)

  if (gesture === 'sideways') {
    return current?.type === 'Twist' ? undefined : { type: 'Twist', dir: 'V' }
  }

  const dir = gesture === 'up' ? 'F' : 'B'
  if (current?.type === 'Turn' && current.dir === dir) {
    const dist = current.dist ?? 1
    if (dist === 1) return { type: 'Turn', dir, dist: 2 }
    return undefined
  }
  return { type: 'Turn', dir, dist: 1 }
}

/**
 * Classifies a pointer-move delta (in pixels, from gesture start to
 * release) into a {@link PickGesture}. Movements below `threshold` in both
 * axes are treated as a plain `'tap'`; otherwise the axis with the larger
 * absolute delta determines vertical (`'up'`/`'down'`) vs horizontal
 * (`'sideways'`).
 */
export function gestureFromSwipe(dx: number, dy: number, threshold = 24): PickGesture {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return 'tap'
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'up' : 'down'
  return 'sideways'
}

/** Compact label for a pick-grid cell, independent of the card's Threading (that mapping is Stage 3's Weaving Draft concern). */
export function actionLabel(action: Action | undefined): string {
  if (!action) return '·'
  if (action.type === 'Twist') return 'Tw'
  const dist = action.dist ?? 1
  return `${action.dir}${dist}`
}
