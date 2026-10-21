import { beforeEach, describe, expect, it } from 'vitest'

import { resetDbConnectionForTests } from '@/storage/db'
import { createNewPattern } from '@/storage/patternRepository'
import { useEditPatternStore } from '@/state/editPatternStore'

beforeEach(async () => {
  await resetDbConnectionForTests()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('twine-db')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
  useEditPatternStore.setState({ pattern: undefined, loading: false, error: undefined, dirty: false })
})

async function loadFreshPattern(name = 'Test'): Promise<string> {
  const created = await createNewPattern(name)
  await useEditPatternStore.getState().load(created.id)
  return created.id
}

describe('editPatternStore: load/save', () => {
  it('loads an existing pattern by id', async () => {
    const id = await loadFreshPattern('Hello')
    expect(useEditPatternStore.getState().pattern?.name).toBe('Hello')
    expect(useEditPatternStore.getState().pattern?.id).toBe(id)
    expect(useEditPatternStore.getState().dirty).toBe(false)
  })

  it('sets an error when loading a non-existent id', async () => {
    await useEditPatternStore.getState().load('missing')
    expect(useEditPatternStore.getState().error).toMatch(/No pattern found/)
    expect(useEditPatternStore.getState().pattern).toBeUndefined()
  })

  it('setName marks dirty and updates the in-memory pattern', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().setName('Renamed')
    expect(useEditPatternStore.getState().pattern?.name).toBe('Renamed')
    expect(useEditPatternStore.getState().dirty).toBe(true)
  })

  it('save persists the in-memory pattern and clears dirty', async () => {
    const id = await loadFreshPattern()
    useEditPatternStore.getState().setName('Persisted Name')
    await useEditPatternStore.getState().save()
    expect(useEditPatternStore.getState().dirty).toBe(false)

    await useEditPatternStore.getState().load(id)
    expect(useEditPatternStore.getState().pattern?.name).toBe('Persisted Name')
  })
})

describe('editPatternStore: palette', () => {
  it('setPaletteColour sets and unsets a slot', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().setPaletteColour(5, 0xabcdef)
    expect(useEditPatternStore.getState().pattern?.palette.colours[5]).toBe(0xabcdef)
    useEditPatternStore.getState().setPaletteColour(5, undefined)
    expect(useEditPatternStore.getState().pattern?.palette.colours[5]).toBeUndefined()
  })
})

describe('editPatternStore: card count changes', () => {
  it('previewSetCardCount returns undefined when count is unchanged', async () => {
    await loadFreshPattern()
    const count = useEditPatternStore.getState().pattern!.cards.length
    expect(useEditPatternStore.getState().previewSetCardCount(count)).toBeUndefined()
  })

  it('previewSetCardCount returns undefined for an increase (non-destructive) and flags a decrease', async () => {
    await loadFreshPattern()
    const count = useEditPatternStore.getState().pattern!.cards.length
    expect(useEditPatternStore.getState().previewSetCardCount(count + 1)).toBeUndefined()
    expect(useEditPatternStore.getState().previewSetCardCount(count - 1)?.kind).toBe('reduceCardCount')
  })

  it('applySetCardCount increase appends a new highest-numbered card, implicitly Idle elsewhere', async () => {
    await loadFreshPattern()
    const before = useEditPatternStore.getState().pattern!.cards.length
    useEditPatternStore.getState().applySetCardCount(before + 1)
    const cards = useEditPatternStore.getState().pattern!.cards
    expect(cards).toHaveLength(before + 1)
    expect(cards[cards.length - 1].number).toBe(before + 1)
  })

  it('applySetCardCount decrease removes actions targeting the removed cards from all picks', async () => {
    const id = await loadFreshPattern()
    const pattern = useEditPatternStore.getState().pattern!
    // Manually inject a pick referencing the last card.
    const lastCardNumber = pattern.cards.length
    useEditPatternStore.setState({
      pattern: {
        ...pattern,
        picks: [{ mode: 'Card', actions: new Map([[String(lastCardNumber), { type: 'Turn', dir: 'F', dist: 1 }]]) }],
      },
    })
    useEditPatternStore.getState().applySetCardCount(lastCardNumber - 1)
    const picks = useEditPatternStore.getState().pattern!.picks
    expect(picks[0].actions.has(String(lastCardNumber))).toBe(false)
    void id
  })

  it('applySetCardCount clamps to [0, MAX_CARDS]', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().applySetCardCount(99999)
    expect(useEditPatternStore.getState().pattern!.cards.length).toBe(140)
  })
})

describe('editPatternStore: card holes', () => {
  it('previewSetCardHoles flags a reduction but not an increase', async () => {
    await loadFreshPattern()
    expect(useEditPatternStore.getState().previewSetCardHoles(1, 2)?.kind).toBe('reduceHoles')
    expect(useEditPatternStore.getState().previewSetCardHoles(1, 6)).toBeUndefined()
  })

  it('applySetCardHoles truncates/extends holeColours to match the new hole count', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().applySetCardHoles(1, 3)
    const card = useEditPatternStore.getState().pattern!.cards.find((c) => c.number === 1)!
    expect(card.holes).toBe(3)
    expect(card.holeColours).toHaveLength(3)
  })

  it('applySetCardHoles clamps to [MIN_HOLES, MAX_HOLES]', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().applySetCardHoles(1, 1)
    expect(useEditPatternStore.getState().pattern!.cards.find((c) => c.number === 1)!.holes).toBe(3)
    useEditPatternStore.getState().applySetCardHoles(1, 50)
    expect(useEditPatternStore.getState().pattern!.cards.find((c) => c.number === 1)!.holes).toBe(8)
  })
})

describe('editPatternStore: setCardThreading', () => {
  it('toggles a single card threading without affecting others', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().setCardThreading(2, 'Z')
    const cards = useEditPatternStore.getState().pattern!.cards
    expect(cards.find((c) => c.number === 2)!.threading).toBe('Z')
    expect(cards.find((c) => c.number === 1)!.threading).toBe('S')
  })
})

describe('editPatternStore: setHoleColour', () => {
  it('sets a single hole colour on the target card without affecting other holes/cards', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().setHoleColour(1, 0, 2)
    const card1 = useEditPatternStore.getState().pattern!.cards.find((c) => c.number === 1)!
    const card2 = useEditPatternStore.getState().pattern!.cards.find((c) => c.number === 2)!
    expect(card1.holeColours[0]).toBe(2)
    expect(card1.holeColours[1]).toBeUndefined()
    expect(card2.holeColours[0]).toBeUndefined()
  })

  it('unsets a hole colour when passed undefined', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().setHoleColour(1, 0, 3)
    useEditPatternStore.getState().setHoleColour(1, 0, undefined)
    const card1 = useEditPatternStore.getState().pattern!.cards.find((c) => c.number === 1)!
    expect(card1.holeColours[0]).toBeUndefined()
  })
})

describe('editPatternStore: card removal and renumbering', () => {
  it('previewRemoveCard describes the renumbering impact', async () => {
    await loadFreshPattern()
    expect(useEditPatternStore.getState().previewRemoveCard(2)?.kind).toBe('removeCard')
    expect(useEditPatternStore.getState().previewRemoveCard(999)).toBeUndefined()
  })

  it('applyRemoveCard renumbers higher cards down by one and keeps numbers contiguous', async () => {
    await loadFreshPattern() // default 6 cards
    useEditPatternStore.getState().applyRemoveCard(3)
    const cards = useEditPatternStore.getState().pattern!.cards
    expect(cards.map((c) => c.number)).toEqual([1, 2, 3, 4, 5])
  })

  it('applyRemoveCard updates Pack.Cards references to renumbered cards', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPack('P1')
    useEditPatternStore.getState().setPackCards('P1', [2, 3, 5])
    useEditPatternStore.getState().applyRemoveCard(3)
    const pack = useEditPatternStore.getState().pattern!.packs.find((p) => p.name === 'P1')!
    // Card 3 removed; card 5 becomes 4.
    expect(pack.cardNumbers).toEqual([2, 4])
  })

  it('applyRemoveCard updates card-targeted Action TargetIDs across all picks', async () => {
    await loadFreshPattern()
    const pattern = useEditPatternStore.getState().pattern!
    useEditPatternStore.setState({
      pattern: {
        ...pattern,
        picks: [
          {
            mode: 'Card',
            actions: new Map([
              ['2', { type: 'Turn', dir: 'F', dist: 1 }],
              ['5', { type: 'Turn', dir: 'B', dist: 1 }],
            ]),
          },
        ],
      },
    })
    useEditPatternStore.getState().applyRemoveCard(3)
    const actions = useEditPatternStore.getState().pattern!.picks[0].actions
    expect(actions.has('3')).toBe(false) // old key gone (it was renumbered FROM 5 to 4... let's check 2 stays)
    expect(actions.get('2')).toEqual({ type: 'Turn', dir: 'F', dist: 1 })
    expect(actions.get('4')).toEqual({ type: 'Turn', dir: 'B', dist: 1 })
  })
})

describe('editPatternStore: packs', () => {
  it('addPack auto-assigns Order as max(existing)+1', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPack('A')
    useEditPatternStore.getState().addPack('B')
    const packs = useEditPatternStore.getState().pattern!.packs
    expect(packs.find((p) => p.name === 'A')!.order).toBe(1)
    expect(packs.find((p) => p.name === 'B')!.order).toBe(2)
  })

  it('removePack removes it entirely', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPack('A')
    useEditPatternStore.getState().removePack('A')
    expect(useEditPatternStore.getState().pattern!.packs).toHaveLength(0)
  })

  it('setPackOrder updates order directly (editable per spec)', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPack('A')
    useEditPatternStore.getState().setPackOrder('A', 42)
    expect(useEditPatternStore.getState().pattern!.packs.find((p) => p.name === 'A')!.order).toBe(42)
  })
})

describe('editPatternStore: picks grid', () => {
  it('addPick appends a new Card-mode row with no explicit actions', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPick()
    const picks = useEditPatternStore.getState().pattern!.picks
    expect(picks).toHaveLength(1)
    expect(picks[0]).toEqual({ mode: 'Card', actions: new Map() })
  })

  it('addPick is a no-op once MAX_PICKS is reached', async () => {
    await loadFreshPattern()
    for (let i = 0; i < 130; i += 1) useEditPatternStore.getState().addPick()
    expect(useEditPatternStore.getState().pattern!.picks).toHaveLength(128)
  })

  it('removePick removes only the last row; removing any other index is a no-op', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPick()
    useEditPatternStore.getState().addPick()
    useEditPatternStore.getState().removePick(0) // not last -> no-op
    expect(useEditPatternStore.getState().pattern!.picks).toHaveLength(2)
    useEditPatternStore.getState().removePick(1) // last -> removed
    expect(useEditPatternStore.getState().pattern!.picks).toHaveLength(1)
  })

  it('applySetCardAction cycles a card cell through Idle -> F1 -> F2 -> B1 -> B2 -> Twist -> Idle', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPick()
    const cycle = () => useEditPatternStore.getState().applySetCardAction(0, 1)
    const actionFor = () => useEditPatternStore.getState().pattern!.picks[0].actions.get('1')

    cycle()
    expect(actionFor()).toEqual({ type: 'Turn', dir: 'F', dist: 1 })
    cycle()
    expect(actionFor()).toEqual({ type: 'Turn', dir: 'F', dist: 2 })
    cycle()
    expect(actionFor()).toEqual({ type: 'Turn', dir: 'B', dist: 1 })
    cycle()
    expect(actionFor()).toEqual({ type: 'Turn', dir: 'B', dist: 2 })
    cycle()
    expect(actionFor()).toEqual({ type: 'Twist', dir: 'V' })
    cycle()
    expect(actionFor()).toBeUndefined()
  })

  it('previewSetCardAction returns undefined for a Card-mode (or empty Pack-mode) row', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPick()
    expect(useEditPatternStore.getState().previewSetCardAction(0, 1)).toBeUndefined()
  })

  it('previewSetCardAction flags a switchPickMode when the row already has Pack-level actions', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPack('P1')
    useEditPatternStore.getState().addPick()
    useEditPatternStore.getState().applySetPackAction(0, 'P1')
    expect(useEditPatternStore.getState().previewSetCardAction(0, 1)?.kind).toBe('switchPickMode')
  })

  it('applySetCardAction on a Pack-mode row switches it to Card-mode and discards prior pack actions', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPack('P1')
    useEditPatternStore.getState().addPick()
    useEditPatternStore.getState().applySetPackAction(0, 'P1')
    useEditPatternStore.getState().applySetCardAction(0, 1)
    const pick = useEditPatternStore.getState().pattern!.picks[0]
    expect(pick.mode).toBe('Card')
    expect(pick.actions.has('P1')).toBe(false)
    expect(pick.actions.get('1')).toEqual({ type: 'Turn', dir: 'F', dist: 1 })
  })

  it('applySetPackAction cycles a pack column-span cell through the same 6-state cycle', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPack('P1')
    useEditPatternStore.getState().addPick()
    useEditPatternStore.getState().applySetPackAction(0, 'P1')
    expect(useEditPatternStore.getState().pattern!.picks[0].actions.get('P1')).toEqual({
      type: 'Turn',
      dir: 'F',
      dist: 1,
    })
  })

  it('previewSetPackAction flags a switchPickMode when the row already has Card-level actions', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPack('P1')
    useEditPatternStore.getState().addPick()
    useEditPatternStore.getState().applySetCardAction(0, 1)
    expect(useEditPatternStore.getState().previewSetPackAction(0, 'P1')?.kind).toBe('switchPickMode')
  })

  it('applySetPackAction on a Card-mode row switches it to Pack-mode and discards prior card actions', async () => {
    await loadFreshPattern()
    useEditPatternStore.getState().addPack('P1')
    useEditPatternStore.getState().addPick()
    useEditPatternStore.getState().applySetCardAction(0, 1)
    useEditPatternStore.getState().applySetPackAction(0, 'P1')
    const pick = useEditPatternStore.getState().pattern!.picks[0]
    expect(pick.mode).toBe('Pack')
    expect(pick.actions.has('1')).toBe(false)
    expect(pick.actions.get('P1')).toEqual({ type: 'Turn', dir: 'F', dist: 1 })
  })

  it('previewSetCardAction/previewSetPackAction return undefined for an out-of-range pick index', async () => {
    await loadFreshPattern()
    expect(useEditPatternStore.getState().previewSetCardAction(0, 1)).toBeUndefined()
    expect(useEditPatternStore.getState().previewSetPackAction(0, 'none')).toBeUndefined()
  })
})
