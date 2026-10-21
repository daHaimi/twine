import { create } from 'zustand'

import type { Pattern } from '@/domain/model/pattern'
import { LIMITS } from '@/domain/model/pattern'
import {
  clonePattern as repoClonePattern,
  createNewPattern as repoCreateNewPattern,
  deletePattern as repoDeletePattern,
  listPatterns as repoListPatterns,
  renamePattern as repoRenamePattern,
  savePattern as repoSavePattern,
} from '@/storage/patternRepository'

/**
 * Pattern Selection store: owns the list of all stored patterns and the
 * CRUD operations exposed on the "Pattern selection" page. Business rules
 * (naming, limits) live in `src/domain`/`src/storage`; this store only
 * orchestrates calls into those layers and keeps the UI-facing list in
 * sync.
 */
interface PatternListState {
  patterns: Pattern[]
  loading: boolean
  error: string | undefined

  refresh: () => Promise<void>
  createNew: (name: string) => Promise<Pattern>
  clone: (id: string) => Promise<Pattern>
  rename: (id: string, newName: string) => Promise<void>
  remove: (id: string) => Promise<void>
  save: (pattern: Pattern) => Promise<void>
}

export const usePatternListStore = create<PatternListState>((set, get) => ({
  patterns: [],
  loading: false,
  error: undefined,

  refresh: async () => {
    set({ loading: true, error: undefined })
    try {
      const patterns = await repoListPatterns()
      set({ patterns, loading: false })
    } catch (err) {
      set({ loading: false, error: toMessage(err) })
    }
  },

  createNew: async (name: string) => {
    const created = await repoCreateNewPattern(name)
    await get().refresh()
    return created
  },

  clone: async (id: string) => {
    const cloned = await repoClonePattern(id)
    await get().refresh()
    return cloned
  },

  rename: async (id: string, newName: string) => {
    await repoRenamePattern(id, newName)
    await get().refresh()
  },

  remove: async (id: string) => {
    await repoDeletePattern(id)
    await get().refresh()
  },

  save: async (pattern: Pattern) => {
    await repoSavePattern(pattern)
    await get().refresh()
  },
}))

/** Hard limits re-exported for UI validation (e.g. disabling "add card" past the cap). */
export const PATTERN_LIMITS = LIMITS

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
