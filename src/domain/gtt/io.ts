import { parseGtt } from '@/domain/gtt/parser'
import { serializeGtt } from '@/domain/gtt/serializer'
import type { Pattern } from '@/domain/model/pattern'

/**
 * Browser-facing GTT file I/O helpers: reading an uploaded `File`/drag-drop
 * `DataTransfer` into a `Pattern`, and triggering a download of a `Pattern`
 * serialized back to GTT.
 *
 * Kept separate from the pure `parser.ts`/`serializer.ts` modules so those
 * stay fully DOM-independent and trivially unit-testable; this module is
 * the (thin) bridge to actual browser File/Blob/anchor APIs.
 */

export class GttFileReadError extends Error {}

/** Reads a `File` (from an <input type="file"> or drag&drop) and parses it into a `Pattern`. `id` is the local storage key to assign. */
export async function readGttFile(file: File, id: string): Promise<Pattern> {
  let text: string
  try {
    text = await file.text()
  } catch (err) {
    throw new GttFileReadError(`Failed to read file "${file.name}": ${err instanceof Error ? err.message : String(err)}`)
  }
  return parseGtt(text, id)
}

/** Derives a filesystem-safe `.gtt` filename from a pattern's name. */
export function gttFilenameFor(pattern: Pattern): string {
  const safe = pattern.name.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'pattern'
  return `${safe}.gtt`
}

/**
 * Serializes `pattern` to GTT and triggers a browser download of it via a
 * temporary anchor element + Blob URL (the standard client-side-only
 * download technique, since TWINE has no backend to generate the file).
 */
export function downloadPattern(pattern: Pattern): void {
  const xml = serializeGtt(pattern)
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = gttFilenameFor(pattern)
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    URL.revokeObjectURL(url)
  }
}
