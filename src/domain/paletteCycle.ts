/**
 * Pure cycling logic for the Cards grid's "click/tap a hole cell to cycle
 * its colour" interaction (see PROJECT-PROMPT.md "Edit pattern" / "picks"
 * section, card-config.png layout): "clicking/tapping a cell cycles it to
 * the next assigned palette color (unset slots are skipped in the cycle,
 * shown as a neutral hatched placeholder)".
 *
 * The cycle walks only through palette slots that currently have an
 * assigned colour (unset palette slots - distinct from an unset *hole* -
 * are never a landing spot), and wraps back to "hole unset" after the last
 * assigned slot, so a hole can always be cleared again by continuing to
 * click/tap.
 */
export function nextAssignedPaletteIndex(
  paletteColours: readonly (number | undefined)[],
  current: number | undefined,
): number | undefined {
  const assigned: number[] = []
  for (let i = 1; i <= 16; i += 1) {
    if (paletteColours[i] !== undefined) assigned.push(i)
  }
  if (assigned.length === 0) return undefined

  if (current === undefined) return assigned[0]

  const idx = assigned.indexOf(current)
  if (idx === -1 || idx === assigned.length - 1) return undefined
  return assigned[idx + 1]
}
