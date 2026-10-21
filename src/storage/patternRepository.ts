import type { Pattern } from '@/domain/model/pattern'
import { LIMITS } from '@/domain/model/pattern'
import { nextCloneName } from '@/domain/naming'
import { getDb, PATTERNS_STORE } from '@/storage/db'

/**
 * Repository for `Pattern` persistence in IndexedDB.
 *
 * This is the only place in the app that talks to the `patterns` object
 * store directly; all pattern CRUD (Pattern Selection page, Edit Pattern
 * save, etc.) goes through these functions so storage concerns stay out of
 * the UI/state layers.
 */

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `pattern-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Lists all stored patterns, sorted by name for stable display order. */
export async function listPatterns(): Promise<Pattern[]> {
  const db = await getDb()
  const all = await db.getAll(PATTERNS_STORE)
  return all.sort((a, b) => a.name.localeCompare(b.name))
}

/** Fetches a single pattern by id, or undefined if not found. */
export async function getPattern(id: string): Promise<Pattern | undefined> {
  const db = await getDb()
  return db.get(PATTERNS_STORE, id)
}

/** Inserts or overwrites a pattern (used both for initial save and subsequent edits). */
export async function savePattern(pattern: Pattern): Promise<void> {
  const db = await getDb()
  await db.put(PATTERNS_STORE, pattern)
}

/** Deletes a pattern by id. No-op if it doesn't exist. */
export async function deletePattern(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(PATTERNS_STORE, id)
}

/** Default palette: 4 colours evoking common Viking-age textile dyes (see IMPLEMENTATION-PLAN.md decision #7), remaining 12 slots unset. */
export function createDefaultPalette(): Pattern['palette'] {
  const colours: (number | undefined)[] = Array.from({ length: 17 }, () => undefined)
  // Packed as 0x00BBGGRR.
  colours[1] = cssToPacked('#e3d5b8') // Natural/undyed wool
  colours[2] = cssToPacked('#a33b20') // Madder red
  colours[3] = cssToPacked('#2d4f6c') // Woad blue
  colours[4] = cssToPacked('#c9a227') // Weld yellow
  return { name: '', colours }
}

function cssToPacked(css: string): number {
  const hex = css.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return r | (g << 8) | (b << 16)
}

/** Default card set: 6 cards, 4 holes each, all threaded S, no hole colours assigned (see IMPLEMENTATION-PLAN.md decision #8). */
export function createDefaultCards(count = 6, holes = 4): Pattern['cards'] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    holes,
    holeColours: Array.from({ length: holes }, () => undefined),
    threading: 'S' as const,
  }))
}

/** Creates a brand-new, empty pattern with default configuration and persists it immediately. */
export async function createNewPattern(name: string): Promise<Pattern> {
  const pattern: Pattern = {
    id: randomId(),
    name,
    cards: createDefaultCards(),
    packs: [],
    palette: createDefaultPalette(),
    picks: [],
    preserved: { releasePresent: false },
  }
  await savePattern(pattern)
  return pattern
}

/**
 * Clones an existing pattern, assigning it a new name per the "-<N>" naming
 * rule (see `src/domain/naming.ts`) and a fresh id, then persists it.
 */
export async function clonePattern(id: string): Promise<Pattern> {
  const source = await getPattern(id)
  if (!source) {
    throw new Error(`clonePattern: no pattern found with id "${id}"`)
  }

  const existingNames = (await listPatterns()).map((p) => p.name)
  const newName = nextCloneName(source.name, existingNames)

  const clone: Pattern = {
    ...structuredCloneCompat(source),
    id: randomId(),
    name: newName,
  }
  await savePattern(clone)
  return clone
}

/** Renames a pattern in place. */
export async function renamePattern(id: string, newName: string): Promise<void> {
  const pattern = await getPattern(id)
  if (!pattern) {
    throw new Error(`renamePattern: no pattern found with id "${id}"`)
  }
  await savePattern({ ...pattern, name: newName })
}

/** Hard cap on stored card count, re-exported for convenience at call sites that validate before calling into the store. */
export const MAX_CARDS = LIMITS.MAX_CARDS

function structuredCloneCompat<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  // Fallback for environments without structuredClone (should not occur in
  // modern browsers or Node >= 17, but guards against older test runners).
  return JSON.parse(JSON.stringify(value)) as T
}
