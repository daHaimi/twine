import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { nextAssignedPaletteIndex } from '@/domain/paletteCycle'

function paletteWith(assignedIndices: number[]): (number | undefined)[] {
  const colours: (number | undefined)[] = Array.from({ length: 17 }, () => undefined)
  for (const i of assignedIndices) colours[i] = 0x000000
  return colours
}

describe('nextAssignedPaletteIndex', () => {
  it('returns undefined when no palette slot is assigned', () => {
    expect(nextAssignedPaletteIndex(paletteWith([]), undefined)).toBeUndefined()
    expect(nextAssignedPaletteIndex(paletteWith([]), 3)).toBeUndefined()
  })

  it('starting from unset, lands on the first assigned slot', () => {
    expect(nextAssignedPaletteIndex(paletteWith([2, 5, 9]), undefined)).toBe(2)
  })

  it('steps to the next assigned slot in ascending order, skipping unset ones', () => {
    const palette = paletteWith([2, 5, 9])
    expect(nextAssignedPaletteIndex(palette, 2)).toBe(5)
    expect(nextAssignedPaletteIndex(palette, 5)).toBe(9)
  })

  it('wraps back to unset after the last assigned slot', () => {
    expect(nextAssignedPaletteIndex(paletteWith([2, 5, 9]), 9)).toBeUndefined()
  })

  it('treats a current value that is no longer assigned as if restarting the cycle (wraps to unset)', () => {
    // Index 5 is no longer assigned -> indexOf returns -1 -> wraps to unset.
    expect(nextAssignedPaletteIndex(paletteWith([2, 9]), 5)).toBeUndefined()
  })

  it('always returns either undefined or one of the assigned indices (fuzz)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 16 }), { minLength: 0, maxLength: 16 }),
        fc.option(fc.integer({ min: 1, max: 16 }), { nil: undefined }),
        (assigned, current) => {
          const palette = paletteWith(assigned)
          const next = nextAssignedPaletteIndex(palette, current)
          if (next !== undefined) {
            expect(assigned).toContain(next)
          }
        },
      ),
    )
  })

  it('repeatedly cycling from unset visits every assigned slot exactly once before returning to unset (fuzz)', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 16 }), { minLength: 0, maxLength: 16 }), (assigned) => {
        const palette = paletteWith(assigned)
        const sorted = [...assigned].sort((a, b) => a - b)
        let current: number | undefined
        const visited: number[] = []
        for (let i = 0; i < sorted.length; i += 1) {
          current = nextAssignedPaletteIndex(palette, current)
          if (current !== undefined) visited.push(current)
        }
        expect(visited).toEqual(sorted)
        // One more step returns to unset.
        expect(nextAssignedPaletteIndex(palette, current)).toBeUndefined()
      }),
    )
  })
})
