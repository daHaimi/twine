import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { Pattern } from '@/domain/model/pattern'

/**
 * IndexedDB schema and connection management for TWINE.
 *
 * All persistence is local-only (TWINE runs fully in the browser, see
 * PROJECT-PROMPT.md "TWINE runs fully in the browser. So all storage is in
 * IndexedDB."). This module owns the single shared database connection;
 * repositories (`patternRepository.ts`, `snippetRepository.ts`) layer typed
 * CRUD operations on top of it.
 */

export const DB_NAME = 'twine-db'
export const DB_VERSION = 1

export const PATTERNS_STORE = 'patterns'
export const SNIPPETS_STORE = 'snippets'

interface TwineDbSchema extends DBSchema {
  [PATTERNS_STORE]: {
    key: string
    value: Pattern
    indexes: { 'by-name': string }
  }
  [SNIPPETS_STORE]: {
    key: string
    // Snippet type is defined in Stage 6; stored loosely here to avoid a
    // premature cross-stage dependency in the schema module.
    value: { id: string; name: string } & Record<string, unknown>
    indexes: { 'by-name': string }
  }
}

let dbPromise: Promise<IDBPDatabase<TwineDbSchema>> | undefined

/** Opens (or returns the already-open) shared TWINE IndexedDB connection. */
export function getDb(): Promise<IDBPDatabase<TwineDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<TwineDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PATTERNS_STORE)) {
          const store = db.createObjectStore(PATTERNS_STORE, { keyPath: 'id' })
          store.createIndex('by-name', 'name')
        }
        if (!db.objectStoreNames.contains(SNIPPETS_STORE)) {
          const store = db.createObjectStore(SNIPPETS_STORE, { keyPath: 'id' })
          store.createIndex('by-name', 'name')
        }
      },
    })
  }
  return dbPromise
}

/** Closes and clears the cached connection (intended for test teardown between isolated DB instances, since a dangling open connection would otherwise block a subsequent `indexedDB.deleteDatabase()` call indefinitely). */
export async function resetDbConnectionForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
  }
  dbPromise = undefined
}
