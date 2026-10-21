import { beforeEach, describe, expect, it } from 'vitest'

import type { Pattern } from '@/domain/model/pattern'
import { resetDbConnectionForTests } from '@/storage/db'
import {
  clonePattern,
  createDefaultCards,
  createDefaultPalette,
  createNewPattern,
  deletePattern,
  getPattern,
  listPatterns,
  renamePattern,
  savePattern,
} from '@/storage/patternRepository'

// Each test gets a fresh in-memory IndexedDB instance (fake-indexeddb resets
// per module import, but since we share one global DB name across tests we
// explicitly clear it between tests to keep them isolated).
beforeEach(async () => {
  await resetDbConnectionForTests()
  // fake-indexeddb persists per-name databases for the lifetime of the test
  // process; delete it so each test starts from a clean slate.
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('twine-db')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
})

describe('createDefaultPalette', () => {
  it('sets exactly 4 colours, leaving the remaining 12 unset', () => {
    const palette = createDefaultPalette()
    const setCount = palette.colours.filter((c) => c !== undefined).length
    expect(setCount).toBe(4)
    expect(palette.colours[1]).toBeDefined()
    expect(palette.colours[4]).toBeDefined()
    expect(palette.colours[5]).toBeUndefined()
  })
})

describe('createDefaultCards', () => {
  it('creates 6 cards with 4 holes, S-threading, no hole colours by default', () => {
    const cards = createDefaultCards()
    expect(cards).toHaveLength(6)
    for (const card of cards) {
      expect(card.holes).toBe(4)
      expect(card.threading).toBe('S')
      expect(card.holeColours).toEqual([undefined, undefined, undefined, undefined])
    }
    expect(cards.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('pattern repository CRUD', () => {
  it('creates and retrieves a new pattern with default configuration', async () => {
    const created = await createNewPattern('My Pattern')
    const fetched = await getPattern(created.id)
    expect(fetched).toEqual(created)
    expect(fetched?.name).toBe('My Pattern')
    expect(fetched?.cards).toHaveLength(6)
  })

  it('lists patterns sorted by name', async () => {
    await createNewPattern('Zebra')
    await createNewPattern('Apple')
    const list = await listPatterns()
    expect(list.map((p) => p.name)).toEqual(['Apple', 'Zebra'])
  })

  it('saves (overwrites) an existing pattern', async () => {
    const created = await createNewPattern('Original')
    const updated: Pattern = { ...created, name: 'Updated' }
    await savePattern(updated)
    const fetched = await getPattern(created.id)
    expect(fetched?.name).toBe('Updated')
  })

  it('deletes a pattern', async () => {
    const created = await createNewPattern('To Delete')
    await deletePattern(created.id)
    const fetched = await getPattern(created.id)
    expect(fetched).toBeUndefined()
  })

  it('delete is a no-op for a non-existent id', async () => {
    await expect(deletePattern('does-not-exist')).resolves.toBeUndefined()
  })

  it('renames a pattern', async () => {
    const created = await createNewPattern('Before')
    await renamePattern(created.id, 'After')
    const fetched = await getPattern(created.id)
    expect(fetched?.name).toBe('After')
  })

  it('renamePattern throws for a non-existent id', async () => {
    await expect(renamePattern('nope', 'x')).rejects.toThrow(/no pattern found/)
  })
})

describe('clonePattern', () => {
  it('clones with a new id and "-1" suffixed name', async () => {
    const original = await createNewPattern('Foo')
    const clone = await clonePattern(original.id)
    expect(clone.id).not.toBe(original.id)
    expect(clone.name).toBe('Foo-1')
    expect(clone.cards).toEqual(original.cards)
  })

  it('uses the lowest unused suffix when cloning repeatedly', async () => {
    const original = await createNewPattern('Foo')
    await clonePattern(original.id) // Foo-1
    const second = await clonePattern(original.id) // Foo-2
    expect(second.name).toBe('Foo-2')
  })

  it('deep-clones mutable fields (editing the clone does not affect the original)', async () => {
    const original = await createNewPattern('Foo')
    const clone = await clonePattern(original.id)
    clone.cards[0].threading = 'Z'
    const reFetchedOriginal = await getPattern(original.id)
    expect(reFetchedOriginal?.cards[0].threading).toBe('S')
  })

  it('throws for a non-existent source id', async () => {
    await expect(clonePattern('missing')).rejects.toThrow(/no pattern found/)
  })
})
