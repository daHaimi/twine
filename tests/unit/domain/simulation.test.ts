import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { Card, Pack, Pick } from '@/domain/model/pattern'
import { resolveCardDelta, simulateAllCards, simulateCard } from '@/domain/simulation'

function card(overrides: Partial<Card> = {}): Card {
  return {
    number: 1,
    holes: 4,
    holeColours: [1, 2, 3, 4],
    threading: 'S',
    ...overrides,
  }
}

function cardPick(actions: Record<string, Pick['actions'] extends Map<string, infer A> ? A : never>): Pick {
  return { mode: 'Card', actions: new Map(Object.entries(actions)) }
}

function packPick(actions: Record<string, Pick['actions'] extends Map<string, infer A> ? A : never>): Pick {
  return { mode: 'Pack', actions: new Map(Object.entries(actions)) }
}

describe('simulateCard', () => {
  it('leaves position at 0 with no picks', () => {
    const result = simulateCard(card(), [], [])
    expect(result.curPos).toBe(0)
    expect(result.curThread).toBe('S')
    expect(result.curHoles).toEqual([1, 2, 3, 4])
  })

  it('advances position forward by Dist on Turn F', () => {
    const picks = [cardPick({ '1': { type: 'Turn', dir: 'F', dist: 1 } })]
    const result = simulateCard(card(), picks, [])
    expect(result.curPos).toBe(1)
  })

  it('retreats position backward by Dist on Turn B', () => {
    const picks = [cardPick({ '1': { type: 'Turn', dir: 'B', dist: 2 } })]
    const result = simulateCard(card(), picks, [])
    // holes=4, pos = (0 - 2) mod 4 = 2
    expect(result.curPos).toBe(2)
  })

  it('wraps position modulo hole count', () => {
    const picks = Array.from({ length: 5 }, () => cardPick({ '1': { type: 'Turn', dir: 'F', dist: 1 } }))
    const result = simulateCard(card({ holes: 4 }), picks, [])
    expect(result.curPos).toBe(1) // 5 mod 4 = 1
  })

  it('treats missing actions and idle/twist as zero delta', () => {
    const picks = [cardPick({}), cardPick({ '1': { type: 'Turn', dir: 'I' } }), cardPick({ '1': { type: 'Twist', dir: 'V' } })]
    const result = simulateCard(card(), picks, [])
    expect(result.curPos).toBe(0)
  })

  it('defaults Dist to 1 when omitted', () => {
    const picks = [cardPick({ '1': { type: 'Turn', dir: 'F' } })]
    const result = simulateCard(card(), picks, [])
    expect(result.curPos).toBe(1)
  })

  it('computes curHoles as a rotation of holeColours by pos', () => {
    const picks = [cardPick({ '1': { type: 'Turn', dir: 'F', dist: 1 } })]
    const result = simulateCard(card({ holeColours: [10, 20, 30, 40] }), picks, [])
    // pos=1 => curHoles[i] = holeColours[(i-1) mod 4]
    expect(result.curHoles).toEqual([40, 10, 20, 30])
  })
});

describe('resolveCardDelta - Pack mode cumulative overlap', () => {
  it('sums deltas from all packs covering the card, in ascending Order', () => {
    const c = card({ number: 1 })
    const packs: Pack[] = [
      { name: 'PackB', order: 2, cardNumbers: [1] },
      { name: 'PackA', order: 1, cardNumbers: [1] },
    ]
    const pick = packPick({
      PackA: { type: 'Turn', dir: 'F', dist: 1 },
      PackB: { type: 'Turn', dir: 'F', dist: 2 },
    })
    expect(resolveCardDelta(c, pick, packs)).toBe(3)
  })

  it('defaults to Idle (0) for a card covered by no pack with an action', () => {
    const c = card({ number: 5 })
    const packs: Pack[] = [{ name: 'PackA', order: 1, cardNumbers: [1, 2] }]
    const pick = packPick({ PackA: { type: 'Turn', dir: 'F', dist: 1 } })
    expect(resolveCardDelta(c, pick, packs)).toBe(0)
  })

  it('ignores a pack covering the card but without an action in this pick', () => {
    const c = card({ number: 1 })
    const packs: Pack[] = [{ name: 'PackA', order: 1, cardNumbers: [1] }]
    const pick = packPick({}) // no actions at all
    expect(resolveCardDelta(c, pick, packs)).toBe(0)
  })
})

describe('simulateAllCards', () => {
  it('simulates every card independently, keyed by card number', () => {
    const cards = [card({ number: 1 }), card({ number: 2, threading: 'Z' })]
    const picks = [cardPick({ '1': { type: 'Turn', dir: 'F', dist: 1 } })]
    const results = simulateAllCards(cards, picks, [])
    expect(results.get(1)?.curPos).toBe(1)
    expect(results.get(2)?.curPos).toBe(0)
    expect(results.get(2)?.curThread).toBe('Z')
  })
})

describe('simulateCard (fuzz)', () => {
  it('curPos is always within [0, holes)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        fc.array(fc.record({ dir: fc.constantFrom('F', 'B', 'I'), dist: fc.constantFrom(1, 2) }), { maxLength: 50 }),
        (holes, turns) => {
          const c = card({ holes, holeColours: Array.from({ length: holes }, (_, i) => i + 1) })
          const picks = turns.map((t) => cardPick({ '1': { type: 'Turn', dir: t.dir as 'F' | 'B' | 'I', dist: t.dist as 1 | 2 } }))
          const result = simulateCard(c, picks, [])
          expect(result.curPos).toBeGreaterThanOrEqual(0)
          expect(result.curPos).toBeLessThan(holes)
        },
      ),
    )
  })

  it('curHoles is always a permutation of holeColours (same multiset)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        fc.array(fc.record({ dir: fc.constantFrom('F', 'B', 'I'), dist: fc.constantFrom(1, 2) }), { maxLength: 20 }),
        (holes, turns) => {
          const colours = Array.from({ length: holes }, (_, i) => i + 1)
          const c = card({ holes, holeColours: colours })
          const picks = turns.map((t) => cardPick({ '1': { type: 'Turn', dir: t.dir as 'F' | 'B' | 'I', dist: t.dist as 1 | 2 } }))
          const result = simulateCard(c, picks, [])
          expect([...result.curHoles].sort()).toEqual([...colours].sort())
        },
      ),
    )
  })

  it('a Forward turn followed immediately by a Backward turn of equal distance cancels out', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 8 }), fc.constantFrom(1, 2), (holes, dist) => {
        const c = card({ holes })
        const picks = [
          cardPick({ '1': { type: 'Turn', dir: 'F', dist: dist as 1 | 2 } }),
          cardPick({ '1': { type: 'Turn', dir: 'B', dist: dist as 1 | 2 } }),
        ]
        const result = simulateCard(c, picks, [])
        expect(result.curPos).toBe(0)
      }),
    )
  })
})
