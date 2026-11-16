import { useState } from 'react'

import type { Pattern } from '@/domain/model/pattern'
import type { DraftCache } from '@/domain/weavingDraft'
import { buildDraftCache, updateDraftCache } from '@/domain/weavingDraft'

/**
 * Returns the weaving-draft rows for `pattern`, reusing the untouched prefix
 * of the previous result when only some picks changed (Stage 4 live preview).
 *
 * The cache is adjusted during render (React's documented "adjusting state
 * when props change" pattern) because the update is a pure function of
 * `(previous cache, pattern)`. When nothing changed, `updateDraftCache`
 * returns the identical object, so no state update is scheduled.
 */
export function useDraftRows(pattern: Pattern | undefined) {
  const [cache, setCache] = useState<DraftCache | undefined>(undefined)

  if (!pattern) {
    if (cache !== undefined) setCache(undefined)
    return []
  }

  const next = cache ? updateDraftCache(cache, pattern) : buildDraftCache(pattern)
  if (next !== cache) setCache(next)
  return next.rows
}
