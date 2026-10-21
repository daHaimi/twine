/**
 * Colour codec for GTT `<Colour>` values.
 *
 * GTT packs colours as Delphi `TColor` / Windows `COLORREF` integers using
 * the `0x00BBGGRR` byte layout (byte0=R, byte1=G, byte2=B, byte3 unused/0).
 * This is the *opposite* byte order from CSS `#RRGGBB` hex strings, so
 * converting between the two requires swapping the R and B byte positions.
 *
 * Verified against the reference file `10cOseberg12L1-aisling.gtt`, e.g.
 * palette index 10 = `255` (0x0000FF) => R=0xFF,G=0,B=0 => CSS `#ff0000`.
 */

const BYTE_MASK = 0xff

/** Smallest valid packed `0x00BBGGRR` value (black, `#000000`). */
export const MIN_PACKED_COLOUR = 0
/** Largest valid packed `0x00BBGGRR` value (white, `#ffffff`). */
export const MAX_PACKED_COLOUR = 0xffffff

/**
 * Converts a GTT packed colour integer (`0x00BBGGRR`) into a CSS
 * `#rrggbb` hex colour string.
 *
 * @throws RangeError if the value is not a non-negative integer within the
 *   valid 24-bit packed-colour range (`0..0xFFFFFF`).
 */
export function colourToCss(packed: number): string {
  if (!Number.isInteger(packed) || packed < MIN_PACKED_COLOUR || packed > MAX_PACKED_COLOUR) {
    throw new RangeError(
      `colourToCss: expected an integer in [${MIN_PACKED_COLOUR}, ${MAX_PACKED_COLOUR}], got ${packed}`,
    )
  }

  const r = packed & BYTE_MASK
  const g = (packed >> 8) & BYTE_MASK
  const b = (packed >> 16) & BYTE_MASK

  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
}

/**
 * Converts a CSS `#rrggbb` (or `#RRGGBB`) hex colour string into a GTT
 * packed colour integer (`0x00BBGGRR`).
 *
 * @throws SyntaxError if the input is not a well-formed 6-digit hex colour.
 */
export function cssToColour(css: string): number {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(css.trim())
  if (!match) {
    throw new SyntaxError(`cssToColour: expected a '#rrggbb' hex colour, got ${JSON.stringify(css)}`)
  }

  const hex = match[1]
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)

  return r | (g << 8) | (b << 16)
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0')
}
