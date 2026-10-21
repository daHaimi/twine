import { create } from 'zustand'

import type { Action, Card, Pack, Pattern, Pick } from '@/domain/model/pattern'
import { LIMITS } from '@/domain/model/pattern'
import type { PickGesture } from '@/domain/pickAction'
import { applyGesture } from '@/domain/pickAction'
import { getPattern, savePattern } from '@/storage/patternRepository'

/**
 * Edit Pattern store: owns the currently-loaded `Pattern` draft being
 * edited and all mutation actions for the "configuration" part (Name,
 * Palette, Cards, Packs) described in PROJECT-PROMPT.md. The "picks" part
 * (Stage 2) will extend this store with pick-grid mutation actions.
 *
 * Destructive-change confirmation: actions that can discard existing pick
 * data (`setCardCount`, `setCardHoles`, `removeCard`) do NOT themselves
 * mutate state - they return a `DestructiveChangePreview` describing the
 * impact, which the UI shows in a confirmation dialog; the actual mutation
 * only happens once the UI calls the corresponding `apply*` action after
 * confirmation. This keeps the "must show a warning before applying" rule
 * enforceable/testable at the store level rather than relying on UI
 * discipline alone.
 */

export interface DestructiveChangePreview {
  kind: 'reduceCardCount' | 'reduceHoles' | 'removeCard' | 'switchPickMode'
  message: string
}

interface EditPatternState {
  pattern: Pattern | undefined
  loading: boolean
  error: string | undefined
  dirty: boolean

  load: (id: string) => Promise<void>
  save: () => Promise<void>
  setName: (name: string) => void

  setPaletteColour: (index: number, packed: number | undefined) => void

  previewSetCardCount: (newCount: number) => DestructiveChangePreview | undefined
  applySetCardCount: (newCount: number) => void

  previewSetCardHoles: (cardNumber: number, newHoles: number) => DestructiveChangePreview | undefined
  applySetCardHoles: (cardNumber: number, newHoles: number) => void

  setCardThreading: (cardNumber: number, threading: Card['threading']) => void

  setHoleColour: (cardNumber: number, holeIndex: number, colourIndex: number | undefined) => void

  previewRemoveCard: (cardNumber: number) => DestructiveChangePreview | undefined
  applyRemoveCard: (cardNumber: number) => void

  addPack: (name: string) => void
  removePack: (name: string) => void
  setPackCards: (name: string, cardNumbers: number[]) => void
  setPackOrder: (name: string, order: number) => void

  addPick: () => void
  removePick: (pickIndex: number) => void

  previewSetCardAction: (pickIndex: number, cardNumber: number) => DestructiveChangePreview | undefined
  applySetCardAction: (pickIndex: number, cardNumber: number, gesture?: PickGesture) => void

  previewSetPackAction: (pickIndex: number, packName: string) => DestructiveChangePreview | undefined
  applySetPackAction: (pickIndex: number, packName: string, gesture?: PickGesture) => void
}

export const useEditPatternStore = create<EditPatternState>((set, get) => ({
  pattern: undefined,
  loading: false,
  error: undefined,
  dirty: false,

  load: async (id: string) => {
    set({ loading: true, error: undefined })
    try {
      const pattern = await getPattern(id)
      if (!pattern) {
        set({ loading: false, error: `No pattern found with id "${id}"`, pattern: undefined })
        return
      }
      set({ pattern, loading: false, dirty: false })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  save: async () => {
    const { pattern } = get()
    if (!pattern) return
    await savePattern(pattern)
    set({ dirty: false })
  },

  setName: (name: string) => {
    mutate(set, get, (p) => ({ ...p, name }))
  },

  setPaletteColour: (index: number, packed: number | undefined) => {
    mutate(set, get, (p) => {
      const colours = [...p.palette.colours]
      colours[index] = packed
      return { ...p, palette: { ...p.palette, colours } }
    })
  },

  previewSetCardCount: (newCount: number) => {
    const { pattern } = get()
    if (!pattern) return undefined
    const currentCount = pattern.cards.length
    if (newCount >= currentCount) return undefined
    return {
      kind: 'reduceCardCount',
      message: `Removing ${currentCount - newCount} card(s). All actions targeting the removed card(s) will be deleted from every pick.`,
    }
  },

  applySetCardCount: (newCount: number) => {
    mutate(set, get, (p) => {
      const clamped = Math.max(0, Math.min(newCount, LIMITS.MAX_CARDS))
      if (clamped === p.cards.length) return p

      if (clamped > p.cards.length) {
        const additions: Card[] = Array.from({ length: clamped - p.cards.length }, (_, i) => ({
          number: p.cards.length + i + 1,
          holes: 4,
          holeColours: Array.from({ length: 4 }, () => undefined),
          threading: 'S' as const,
        }))
        // Idle defaulting is implicit: existing picks simply have no entry
        // for the new card numbers, which the "missing action defaults to
        // Idle" rule already covers - no pick mutation needed.
        return { ...p, cards: [...p.cards, ...additions] }
      }

      const keptCards = p.cards.filter((c) => c.number <= clamped)
      const removedNumbers = new Set(p.cards.filter((c) => c.number > clamped).map((c) => c.number))
      const picks = p.picks.map((pick) => {
        if (pick.mode !== 'Card') return pick
        const actions = new Map(pick.actions)
        for (const num of removedNumbers) {
          actions.delete(String(num))
        }
        return { ...pick, actions }
      })
      return { ...p, cards: keptCards, picks }
    })
  },

  previewSetCardHoles: (cardNumber: number, newHoles: number) => {
    const { pattern } = get()
    if (!pattern) return undefined
    const card = pattern.cards.find((c) => c.number === cardNumber)
    if (!card || card.holes === newHoles) return undefined
    if (newHoles < card.holes) {
      return {
        kind: 'reduceHoles',
        message: `Reducing Card ${cardNumber}'s holes from ${card.holes} to ${newHoles}. Its accumulated turn position will wrap (modulo) to fit the new hole count.`,
      }
    }
    return undefined
  },

  applySetCardHoles: (cardNumber: number, newHoles: number) => {
    const clamped = Math.max(LIMITS.MIN_HOLES, Math.min(newHoles, LIMITS.MAX_HOLES))
    mutate(set, get, (p) => {
      const cards = p.cards.map((c) => {
        if (c.number !== cardNumber) return c
        const holeColours = Array.from({ length: clamped }, (_, i) => c.holeColours[i])
        return { ...c, holes: clamped, holeColours }
      })
      return { ...p, cards }
    })
  },

  setCardThreading: (cardNumber: number, threading: Card['threading']) => {
    mutate(set, get, (p) => ({
      ...p,
      cards: p.cards.map((c) => (c.number === cardNumber ? { ...c, threading } : c)),
    }))
  },

  setHoleColour: (cardNumber: number, holeIndex: number, colourIndex: number | undefined) => {
    mutate(set, get, (p) => ({
      ...p,
      cards: p.cards.map((c) => {
        if (c.number !== cardNumber) return c
        const holeColours = [...c.holeColours]
        holeColours[holeIndex] = colourIndex
        return { ...c, holeColours }
      }),
    }))
  },

  previewRemoveCard: (cardNumber: number) => {
    const { pattern } = get()
    if (!pattern || !pattern.cards.some((c) => c.number === cardNumber)) return undefined
    return {
      kind: 'removeCard',
      message: `Removing Card ${cardNumber}. All higher-numbered cards will be renumbered down by one, and every pack/pick reference to them will be updated accordingly.`,
    }
  },

  applyRemoveCard: (cardNumber: number) => {
    mutate(set, get, (p) => {
      const renumber = (n: number): number => (n > cardNumber ? n - 1 : n)

      const cards = p.cards
        .filter((c) => c.number !== cardNumber)
        .map((c) => ({ ...c, number: renumber(c.number) }))
        .sort((a, b) => a.number - b.number)

      const packs = p.packs.map((pack) => ({
        ...pack,
        cardNumbers: pack.cardNumbers.filter((n) => n !== cardNumber).map(renumber),
      }))

      const picks = p.picks.map((pick) => {
        if (pick.mode !== 'Card') return pick
        const actions = new Map<string, Action>()
        for (const [key, action] of pick.actions) {
          const num = Number.parseInt(key, 10)
          if (num === cardNumber) continue
          actions.set(String(renumber(num)), action)
        }
        return { ...pick, actions }
      })

      return { ...p, cards, packs, picks }
    })
  },

  addPack: (name: string) => {
    mutate(set, get, (p) => {
      const maxOrder = p.packs.reduce((max, pack) => Math.max(max, pack.order), 0)
      const newPack: Pack = { name, order: maxOrder + 1, cardNumbers: [] }
      return { ...p, packs: [...p.packs, newPack] }
    })
  },

  removePack: (name: string) => {
    mutate(set, get, (p) => ({ ...p, packs: p.packs.filter((pack) => pack.name !== name) }))
  },

  setPackCards: (name: string, cardNumbers: number[]) => {
    mutate(set, get, (p) => ({
      ...p,
      packs: p.packs.map((pack) => (pack.name === name ? { ...pack, cardNumbers } : pack)),
    }))
  },

  setPackOrder: (name: string, order: number) => {
    mutate(set, get, (p) => ({
      ...p,
      packs: p.packs.map((pack) => (pack.name === name ? { ...pack, order } : pack)),
    }))
  },

  addPick: () => {
    mutate(set, get, (p) => {
      if (p.picks.length >= LIMITS.MAX_PICKS) return p
      const newPick: Pick = { mode: 'Card', actions: new Map() }
      return { ...p, picks: [...p.picks, newPick] }
    })
  },

  removePick: (pickIndex: number) => {
    mutate(set, get, (p) => {
      // Per PROJECT-PROMPT.md, rows can only be added/removed "at the
      // bottom" - removing anything but the last row is a no-op.
      if (pickIndex !== p.picks.length - 1) return p
      return { ...p, picks: p.picks.slice(0, -1) }
    })
  },

  previewSetCardAction: (pickIndex: number, _cardNumber: number) => {
    const { pattern } = get()
    const pick = pattern?.picks[pickIndex]
    if (!pick) return undefined
    if (pick.mode === 'Pack' && pick.actions.size > 0) {
      return {
        kind: 'switchPickMode',
        message: `Pick ${pickIndex + 1} currently has Pack-level actions. Editing a card cell will discard them and switch this row to Card-level mode.`,
      }
    }
    return undefined
  },

  applySetCardAction: (pickIndex: number, cardNumber: number, gesture: PickGesture = 'tap') => {
    mutate(set, get, (p) => {
      const pick = p.picks[pickIndex]
      if (!pick) return p

      const switchingMode = pick.mode === 'Pack'
      const currentAction = switchingMode ? undefined : pick.actions.get(String(cardNumber))
      const nextAction = applyGesture(currentAction, gesture)

      const actions = switchingMode ? new Map<string, Action>() : new Map(pick.actions)
      if (nextAction) {
        actions.set(String(cardNumber), nextAction)
      } else {
        actions.delete(String(cardNumber))
      }

      const picks = p.picks.map((pk, i) => (i === pickIndex ? { mode: 'Card' as const, actions } : pk))
      return { ...p, picks }
    })
  },

  previewSetPackAction: (pickIndex: number, _packName: string) => {
    const { pattern } = get()
    const pick = pattern?.picks[pickIndex]
    if (!pick) return undefined
    if (pick.mode === 'Card' && pick.actions.size > 0) {
      return {
        kind: 'switchPickMode',
        message: `Pick ${pickIndex + 1} currently has Card-level actions. Editing a pack's column-span will discard them and switch this row to Pack-level mode.`,
      }
    }
    return undefined
  },

  applySetPackAction: (pickIndex: number, packName: string, gesture: PickGesture = 'tap') => {
    mutate(set, get, (p) => {
      const pick = p.picks[pickIndex]
      if (!pick) return p

      const switchingMode = pick.mode === 'Card'
      const currentAction = switchingMode ? undefined : pick.actions.get(packName)
      const nextAction = applyGesture(currentAction, gesture)

      const actions = switchingMode ? new Map<string, Action>() : new Map(pick.actions)
      if (nextAction) {
        actions.set(packName, nextAction)
      } else {
        actions.delete(packName)
      }

      const picks = p.picks.map((pk, i) => (i === pickIndex ? { mode: 'Pack' as const, actions } : pk))
      return { ...p, picks }
    })
  },
}))

function mutate(
  set: (partial: Partial<EditPatternState>) => void,
  get: () => EditPatternState,
  fn: (pattern: Pattern) => Pattern,
): void {
  const { pattern } = get()
  if (!pattern) return
  set({ pattern: fn(pattern), dirty: true })
}
