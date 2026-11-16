import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { Action, Card, Pack, Pattern, Pick } from '@/domain/model/pattern'
import { resolveCardDelta } from '@/domain/simulation'
import {
  buildDraftCache,
  computeDraftRows,
  computeDraftRowsFrom,
  draftActionLabel,
  draftSymbol,
  expandDraftRows,
  rowLabel,
  updateDraftCache,
} from '@/domain/weavingDraft'

function makeCard(number: number, overrides: Partial<Card> = {}): Card {
  return {
    number,
    holes: 4,
    holeColours: [1, 2, 3, 4],
    threading: 'S',
    ...overrides,
  }
}

function makePick(actions: Record<string, Action> = {}, mode: Pick['mode'] = 'Card'): Pick {
  return { mode, actions: new Map(Object.entries(actions)) }
}

function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'test',
    name: 'Test',
    cards: [makeCard(1), makeCard(2, { threading: 'Z', holeColours: [5, 6, 7, 8] })],
    packs: [],
    palette: { name: '', colours: Array.from({ length: 17 }, (_, i) => i * 1000) },
    picks: [],
    preserved: { releasePresent: false },
    ...overrides,
  }
}

const turn = (dir: 'F' | 'B', dist: 1 | 2 = 1): Action => ({ type: 'Turn', dir, dist })
const twist: Action = { type: 'Twist', dir: 'V' }

const actionArb: fc.Arbitrary<Action | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.record({ type: fc.constant('Twist' as const), dir: fc.constant('V' as const) }),
  fc.record({
    type: fc.constant('Turn' as const),
    dir: fc.constantFrom('F', 'B', 'I') as fc.Arbitrary<'F' | 'B' | 'I'>,
    dist: fc.constantFrom(1, 2) as fc.Arbitrary<1 | 2>,
  }),
)

const pickArb = fc
  .dictionary(fc.constantFrom('1', '2', '3', 'P1', 'P2'), actionArb)
  .map((raw) => {
    const actions = new Map<string, Action>()
    for (const [key, action] of Object.entries(raw)) {
      if (action) actions.set(key, action)
    }
    return { mode: 'Card' as const, actions }
  })

const cardArb = fc.integer({ min: 1, max: 4 }).chain((holes) =>
  fc.record({
    number: fc.integer({ min: 1, max: 4 }),
    holes: fc.constant(holes),
    holeColours: fc.array(fc.constantFrom<number | undefined>(1, 2, 3, 4, 5, undefined), {
      minLength: holes,
      maxLength: holes,
    }),
    threading: fc.constantFrom('S', 'Z') as fc.Arbitrary<'S' | 'Z'>,
  }),
)

const packArb = fc.array(
  fc.record({
    name: fc.constantFrom('P1', 'P2'),
    order: fc.nat({ max: 5 }),
    cardNumbers: fc.array(fc.integer({ min: 1, max: 4 })),
  }),
  { maxLength: 2 },
)

describe('draftSymbol', () => {
  it('implements the direction table from the brief exactly', () => {
    expect(draftSymbol('S', 1)).toBe('\\')
    expect(draftSymbol('Z', 1)).toBe('/')
    expect(draftSymbol('S', -1)).toBe('/')
    expect(draftSymbol('Z', -1)).toBe('\\')
    expect(draftSymbol('S', 0)).toBe('|')
    expect(draftSymbol('Z', 0)).toBe('|')
  })

  it('uses only the sign of the net delta, including multi-hole turns (fuzz)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('S', 'Z') as fc.Arbitrary<'S' | 'Z'>,
        fc.integer({ min: -20, max: 20 }),
        (threading, delta) => {
          const expected =
            delta === 0
              ? '|'
              : threading === 'S'
                ? delta > 0
                  ? '\\'
                  : '/'
                : delta > 0
                  ? '/'
                  : '\\'
          expect(draftSymbol(threading, delta)).toBe(expected)
        },
      ),
    )
  })
})

describe('draftActionLabel', () => {
  it('shows F/B/. and the number of holes when more than one turn is needed', () => {
    expect(draftActionLabel(0)).toBe('.')
    expect(draftActionLabel(1)).toBe('F')
    expect(draftActionLabel(2)).toBe('F2')
    expect(draftActionLabel(3)).toBe('F3')
    expect(draftActionLabel(-1)).toBe('B')
    expect(draftActionLabel(-2)).toBe('B2')
    expect(draftActionLabel(-4)).toBe('B4')
  })

  it('never omits the direction for any net delta (fuzz)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -20, max: 20 }), (delta) => {
        const label = draftActionLabel(delta)
        if (delta === 0) {
          expect(label).toBe('.')
        } else {
          expect(label.startsWith(delta > 0 ? 'F' : 'B')).toBe(true)
          if (Math.abs(delta) > 1) expect(label).toBe(`${delta > 0 ? 'F' : 'B'}${Math.abs(delta)}`)
        }
      }),
    )
  })
})

describe('rowLabel', () => {
  it('labels the first 26 rows A..Z then falls back to numbers', () => {
    expect(rowLabel(0)).toBe('A')
    expect(rowLabel(3)).toBe('D')
    expect(rowLabel(25)).toBe('Z')
    expect(rowLabel(26)).toBe('27')
  })

  it('never returns an empty label (fuzz)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (index) => {
        expect(rowLabel(index).length).toBeGreaterThan(0)
      }),
    )
  })
})

describe('computeDraftRows', () => {
  it('returns no rows when there are no picks or no cards', () => {
    expect(computeDraftRows(makePattern())).toEqual([])
    expect(computeDraftRows(makePattern({ cards: [], picks: [makePick()] }))).toEqual([])
  })

  it('creates one row per pick with cycling A/B/C/D labels', () => {
    const rows = computeDraftRows(
      makePattern({ picks: Array.from({ length: 6 }, () => makePick()) }),
    )
    expect(rows.map((r) => r.pickIndex)).toEqual([1, 2, 3, 4, 5, 6])
    expect(rows.map((r) => r.label)).toEqual(['A', 'B', 'C', 'D', 'A', 'B'])
    expect(rows.every((r) => r.cards.length === 2)).toBe(true)
  })

  it('maps turn direction and threading to the right symbol', () => {
    const rows = computeDraftRows(
      makePattern({
        picks: [
          makePick({ '1': turn('F'), '2': turn('F') }),
          makePick({ '1': turn('B'), '2': turn('B') }),
          makePick({ '1': twist, '2': turn('F', 2) }),
        ],
      }),
    )
    expect(rows[0].cards.map((c) => c.symbol)).toEqual(['\\', '/'])
    expect(rows[1].cards.map((c) => c.symbol)).toEqual(['/', '\\'])
    // Twists render as Idle; a 2-hole turn still renders as a forward stroke.
    expect(rows[2].cards.map((c) => c.symbol)).toEqual(['|', '/'])
    expect(rows[2].cards[1].delta).toBe(2)
  })

  it('tracks the thread colour at the weaving position across picks', () => {
    const rows = computeDraftRows(
      makePattern({ cards: [makeCard(1)], picks: [makePick({ '1': turn('F') }), makePick({ '1': turn('F') })] }),
    )
    expect(rows[0].cards[0].colourIndex).toBe(1)
    expect(rows[1].cards[0].colourIndex).toBe(4)
  })

  it('resolves pack-mode picks with order-based overlap like the simulation', () => {
    const packs: Pack[] = [
      { name: 'P1', order: 1, cardNumbers: [1] },
      { name: 'P2', order: 2, cardNumbers: [1] },
    ]
    const rows = computeDraftRows(
      makePattern({
        packs,
        picks: [
          makePick({ P1: turn('F'), P2: turn('B') }, 'Pack'),
          makePick({ P2: turn('F') }, 'Pack'),
        ],
      }),
    )
    expect(rows[0].cards[0].delta).toBe(0) // F1 + B1 cancel
    expect(rows[0].cards[0].symbol).toBe('|')
    expect(rows[1].cards[0].delta).toBe(1)
  })

  it('keeps symbols and colours consistent for arbitrary patterns (fuzz)', () => {
    fc.assert(
      fc.property(
        fc.array(cardArb, { minLength: 1, maxLength: 4 }),
        fc.array(pickArb, { maxLength: 8 }),
        packArb,
        (cards, picks, packs) => {
          const p = makePattern({ cards, picks, packs })
          const rows = computeDraftRows(p)
          expect(rows).toHaveLength(picks.length)

          // Independently recompute each card's cumulative position.
          const positions = cards.map(() => 0)
          rows.forEach((row, i) => {
            expect(row.cards).toHaveLength(cards.length)
            row.cards.forEach((cell, ci) => {
              const card = cards[ci]
              const delta = resolveCardDelta(card, picks[i], packs)
              expect(cell.delta).toBe(delta)
              expect(cell.cardNumber).toBe(card.number)
              expect(cell.symbol).toBe(draftSymbol(card.threading, delta))
              expect(cell.actionLabel).toBe(draftActionLabel(delta))
              const expectedColour = card.holeColours[(((-positions[ci]) % card.holes) + card.holes) % card.holes]
              expect(cell.colourIndex).toBe(expectedColour)
              positions[ci] = ((positions[ci] + delta) % card.holes + card.holes) % card.holes
            })
            expect(row.pickIndex).toBe(i + 1)
          })
        },
      ),
    )
  })
})

describe('expandDraftRows', () => {
  it('clamps the repetition count to the 1..4 range', () => {
    const rows = computeDraftRows(
      makePattern({ picks: [makePick(), makePick()] }),
    )
    expect(expandDraftRows(rows, 0)).toHaveLength(rows.length)
    expect(expandDraftRows(rows, 1)).toHaveLength(rows.length)
    expect(expandDraftRows(rows, 3)).toHaveLength(rows.length * 3)
    expect(expandDraftRows(rows, 9)).toHaveLength(rows.length * 4)
    expect(expandDraftRows(rows, 2.9)).toHaveLength(rows.length * 2)
  })

  it('marks each repetition with an increasing repeat index (fuzz)', () => {
    const rowArb = fc.record({
      pickIndex: fc.nat({ max: 20 }),
      label: fc.constant('A'),
      cards: fc.constant([]),
    })

    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 10 }), fc.integer({ min: -2, max: 7 }), (rows, repetitions) => {
        const count = Math.max(1, Math.min(4, Math.floor(repetitions)))
        const expanded = expandDraftRows(rows, repetitions)
        expect(expanded).toHaveLength(rows.length * count)
        expanded.forEach((entry, i) => {
          expect(entry.row).toBe(rows[i % Math.max(rows.length, 1)])
          expect(entry.repeatIndex).toBe(Math.floor(i / rows.length))
        })
      }),
    )
  })
})

describe('incremental draft recomputation', () => {
  it('resumes from the last preserved row position', () => {
    const pattern = makePattern({
      picks: Array.from({ length: 5 }, (_, i) => makePick({ [String(i % 2 + 1)]: turn(i % 2 ? 'B' : 'F') })),
    })
    const full = computeDraftRows(pattern)
    const resumeAt = 2
    const positions = full[resumeAt - 1].cards.map((cell) => cell.positionAfter)
    expect(computeDraftRowsFrom(pattern, resumeAt, positions)).toEqual(full.slice(resumeAt))
  })

  it('reuses the untouched prefix and returns the same cache when nothing changes', () => {
    const pattern = makePattern({
      picks: [makePick({ '1': turn('F') }), makePick({ '2': turn('B') }), makePick()],
    })
    const cache = buildDraftCache(pattern)
    expect(updateDraftCache(cache, pattern)).toBe(cache)

    const edited: Pattern = {
      ...pattern,
      picks: [pattern.picks[0], makePick({ '2': turn('F') }), pattern.picks[2]],
    }
    const updated = updateDraftCache(cache, edited)
    expect(updated.rows[0]).toBe(cache.rows[0]) // prefix reused by reference
    expect(updated.rows).toEqual(computeDraftRows(edited))
  })

  it('matches a full recompute for arbitrary edits (fuzz)', () => {
    fc.assert(
      fc.property(
        fc.array(cardArb, { minLength: 1, maxLength: 4 }),
        fc.array(pickArb, { maxLength: 8 }),
        packArb,
        fc.array(cardArb, { minLength: 1, maxLength: 4 }),
        fc.array(pickArb, { maxLength: 8 }),
        packArb,
        (cardsA, picksA, packsA, cardsB, picksB, packsB) => {
          const before = makePattern({ cards: cardsA, picks: picksA, packs: packsA })
          const after = makePattern({ cards: cardsB, picks: picksB, packs: packsB })
          const cache = buildDraftCache(before)
          expect(updateDraftCache(cache, before).rows).toEqual(computeDraftRows(before))
          expect(updateDraftCache(cache, after).rows).toEqual(computeDraftRows(after))
          // Reusing an updated cache must also stay consistent.
          const updated = updateDraftCache(cache, after)
          expect(updateDraftCache(updated, before).rows).toEqual(computeDraftRows(before))
        },
      ),
    )
  })

  it('handles appending and removing picks at the bottom (fuzz)', () => {
    fc.assert(
      fc.property(
        fc.array(pickArb, { minLength: 1, maxLength: 6 }),
        fc.array(pickArb, { maxLength: 4 }),
        (picks, added) => {
          const base = makePattern({ picks })
          const appended = makePattern({ picks: [...picks, ...added] })
          const updated = updateDraftCache(buildDraftCache(base), appended)
          expect(updated.rows).toEqual(computeDraftRows(appended))
          expect(updated.rows.slice(0, picks.length)).toEqual(computeDraftRows(base))

          const truncated = makePattern({ picks: picks.slice(0, Math.max(0, picks.length - added.length)) })
          const shrunk = updateDraftCache(buildDraftCache(base), truncated)
          expect(shrunk.rows).toEqual(computeDraftRows(truncated))
        },
      ),
    )
  })
})
