import { beforeEach, describe, expect, it } from 'vitest'

import { resetDbConnectionForTests } from '@/storage/db'
import { getPattern } from '@/storage/patternRepository'
import { usePatternListStore } from '@/state/patternListStore'

beforeEach(async () => {
  await resetDbConnectionForTests()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('twine-db')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
  usePatternListStore.setState({ patterns: [], loading: false, error: undefined })
})

describe('patternListStore', () => {
  it('refresh loads the (initially empty) pattern list', async () => {
    await usePatternListStore.getState().refresh()
    expect(usePatternListStore.getState().patterns).toEqual([])
    expect(usePatternListStore.getState().loading).toBe(false)
    expect(usePatternListStore.getState().error).toBeUndefined()
  })

  it('createNew persists a pattern and refreshes the list', async () => {
    const created = await usePatternListStore.getState().createNew('Alpha')
    expect(created.name).toBe('Alpha')
    expect(usePatternListStore.getState().patterns.map((p) => p.name)).toEqual(['Alpha'])
  })

  it('clone creates a renamed copy and refreshes the list', async () => {
    const original = await usePatternListStore.getState().createNew('Base')
    const cloned = await usePatternListStore.getState().clone(original.id)
    expect(cloned.name).toBe('Base-1')
    expect(usePatternListStore.getState().patterns.map((p) => p.name).sort()).toEqual(['Base', 'Base-1'])
  })

  it('rename updates the stored pattern and refreshes the list', async () => {
    const created = await usePatternListStore.getState().createNew('Old Name')
    await usePatternListStore.getState().rename(created.id, 'New Name')
    expect(usePatternListStore.getState().patterns.map((p) => p.name)).toEqual(['New Name'])
    const stored = await getPattern(created.id)
    expect(stored?.name).toBe('New Name')
  })

  it('remove deletes the pattern and refreshes the list', async () => {
    const created = await usePatternListStore.getState().createNew('ToDelete')
    await usePatternListStore.getState().remove(created.id)
    expect(usePatternListStore.getState().patterns).toEqual([])
    expect(await getPattern(created.id)).toBeUndefined()
  })

  it('save persists an externally-constructed pattern and refreshes the list', async () => {
    const created = await usePatternListStore.getState().createNew('Saved')
    const mutated = { ...created, name: 'Saved (edited)' }
    await usePatternListStore.getState().save(mutated)
    expect(usePatternListStore.getState().patterns.map((p) => p.name)).toEqual(['Saved (edited)'])
  })

  it('refresh sets an error message if the underlying repository call throws', async () => {
    // Force listPatterns() to throw by closing the DB connection it will try to reuse mid-call:
    // simplest reliable way is to monkey-patch indexedDB.open to throw for this one test.
    const originalOpen = indexedDB.open.bind(indexedDB)
    await resetDbConnectionForTests()
    // @ts-expect-error -- intentionally breaking indexedDB.open to simulate a storage failure
    indexedDB.open = () => {
      throw new Error('simulated storage failure')
    }
    try {
      await usePatternListStore.getState().refresh()
      expect(usePatternListStore.getState().error).toMatch(/simulated storage failure/)
      expect(usePatternListStore.getState().loading).toBe(false)
    } finally {
      indexedDB.open = originalOpen
      await resetDbConnectionForTests()
    }
  })
})
