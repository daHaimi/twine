import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { actionLabel, applyGesture, cycleAction, gestureFromSwipe } from '@/domain/pickAction'
import type { Action } from '@/domain/model/pattern'

describe('cycleAction', () => {
  it('cycles Idle -> F1 -> F2 -> B1 -> B2 -> Twist -> Idle', () => {
    let action: Action | undefined
    const seen: (Action | undefined)[] = [action]
    for (let i = 0; i < 6; i += 1) {
      action = cycleAction(action)
      seen.push(action)
    }
    expect(seen).toEqual([
      undefined,
      { type: 'Turn', dir: 'F', dist: 1 },
      { type: 'Turn', dir: 'F', dist: 2 },
      { type: 'Turn', dir: 'B', dist: 1 },
      { type: 'Turn', dir: 'B', dist: 2 },
      { type: 'Twist', dir: 'V' },
      undefined,
    ])
  })

  it('treats an idle Turn (dir "I") defensively as equivalent to Idle', () => {
    expect(cycleAction({ type: 'Turn', dir: 'I' })).toEqual({ type: 'Turn', dir: 'F', dist: 1 })
  })

  it('always returns a value within the 6-state cycle, never mutating its input (fuzz)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(undefined),
          fc.record({ type: fc.constant('Twist' as const), dir: fc.constant('V' as const) }),
          fc.record({
            type: fc.constant('Turn' as const),
            dir: fc.constantFrom('F', 'B', 'I') as fc.Arbitrary<'F' | 'B' | 'I'>,
            dist: fc.constantFrom(1, 2) as fc.Arbitrary<1 | 2>,
          }),
        ),
        (input) => {
          const before = input ? { ...input } : undefined
          const next = cycleAction(input)
          expect(input).toEqual(before) // no mutation of the input
          expect(['·', 'F1', 'F2', 'B1', 'B2', 'Tw']).toContain(actionLabel(next))
        },
      ),
    )
  })
})

describe('actionLabel', () => {
  it('labels Idle as a middle dot', () => {
    expect(actionLabel(undefined)).toBe('·')
  })

  it('labels Turn actions as <dir><dist>, defaulting dist to 1', () => {
    expect(actionLabel({ type: 'Turn', dir: 'F', dist: 2 })).toBe('F2')
    expect(actionLabel({ type: 'Turn', dir: 'B' })).toBe('B1')
  })

  it('labels Twist as "Tw"', () => {
    expect(actionLabel({ type: 'Twist', dir: 'V' })).toBe('Tw')
  })
})

describe('gestureFromSwipe', () => {
  it('classifies small deltas (below threshold in both axes) as a tap', () => {
    expect(gestureFromSwipe(5, -5)).toBe('tap')
    expect(gestureFromSwipe(0, 0)).toBe('tap')
  })

  it('classifies a vertical-dominant swipe as up (negative dy) or down (positive dy)', () => {
    expect(gestureFromSwipe(0, -40)).toBe('up')
    expect(gestureFromSwipe(10, -40)).toBe('up')
    expect(gestureFromSwipe(0, 40)).toBe('down')
    expect(gestureFromSwipe(-10, 40)).toBe('down')
  })

  it('classifies a horizontal-dominant swipe as sideways regardless of direction', () => {
    expect(gestureFromSwipe(40, 0)).toBe('sideways')
    expect(gestureFromSwipe(-40, 10)).toBe('sideways')
  })

  it('respects a custom threshold', () => {
    expect(gestureFromSwipe(10, 10, 5)).not.toBe('tap')
    expect(gestureFromSwipe(10, 10, 50)).toBe('tap')
  })
})

describe('applyGesture', () => {
  it('"tap" delegates to cycleAction', () => {
    expect(applyGesture(undefined, 'tap')).toEqual(cycleAction(undefined))
    expect(applyGesture({ type: 'Twist', dir: 'V' }, 'tap')).toEqual(cycleAction({ type: 'Twist', dir: 'V' }))
  })

  it('"up" cycles Idle -> F1 -> F2 -> Idle, independent of any prior Backward state', () => {
    let action: Action | undefined
    action = applyGesture(action, 'up')
    expect(action).toEqual({ type: 'Turn', dir: 'F', dist: 1 })
    action = applyGesture(action, 'up')
    expect(action).toEqual({ type: 'Turn', dir: 'F', dist: 2 })
    action = applyGesture(action, 'up')
    expect(action).toBeUndefined()

    expect(applyGesture({ type: 'Turn', dir: 'B', dist: 2 }, 'up')).toEqual({ type: 'Turn', dir: 'F', dist: 1 })
  })

  it('"down" cycles Idle -> B1 -> B2 -> Idle, independent of any prior Forward state', () => {
    let action: Action | undefined
    action = applyGesture(action, 'down')
    expect(action).toEqual({ type: 'Turn', dir: 'B', dist: 1 })
    action = applyGesture(action, 'down')
    expect(action).toEqual({ type: 'Turn', dir: 'B', dist: 2 })
    action = applyGesture(action, 'down')
    expect(action).toBeUndefined()

    expect(applyGesture({ type: 'Turn', dir: 'F', dist: 2 }, 'down')).toEqual({ type: 'Turn', dir: 'B', dist: 1 })
  })

  it('"sideways" toggles Twist on/off, discarding any prior Turn state', () => {
    expect(applyGesture(undefined, 'sideways')).toEqual({ type: 'Twist', dir: 'V' })
    expect(applyGesture({ type: 'Turn', dir: 'F', dist: 2 }, 'sideways')).toEqual({ type: 'Twist', dir: 'V' })
    expect(applyGesture({ type: 'Twist', dir: 'V' }, 'sideways')).toBeUndefined()
  })

  it('never mutates its input and always returns a value with a valid actionLabel (fuzz)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(undefined),
          fc.record({ type: fc.constant('Twist' as const), dir: fc.constant('V' as const) }),
          fc.record({
            type: fc.constant('Turn' as const),
            dir: fc.constantFrom('F', 'B', 'I') as fc.Arbitrary<'F' | 'B' | 'I'>,
            dist: fc.constantFrom(1, 2) as fc.Arbitrary<1 | 2>,
          }),
        ),
        fc.constantFrom('tap', 'up', 'down', 'sideways') as fc.Arbitrary<'tap' | 'up' | 'down' | 'sideways'>,
        (input, gesture) => {
          const before = input ? { ...input } : undefined
          const next = applyGesture(input, gesture)
          expect(input).toEqual(before)
          expect(['·', 'F1', 'F2', 'B1', 'B2', 'Tw']).toContain(actionLabel(next))
        },
      ),
    )
  })
})
