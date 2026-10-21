import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { colourToCss, cssToColour, MAX_PACKED_COLOUR, MIN_PACKED_COLOUR } from '@/domain/gtt/colour'

describe('colourToCss', () => {
  it('converts known reference values correctly (0x00BBGGRR -> #rrggbb)', () => {
    // From 10cOseberg12L1-aisling.gtt's palette.
    expect(colourToCss(0)).toBe('#000000') // black
    expect(colourToCss(255)).toBe('#ff0000') // pure red: R=0xFF,G=0,B=0
    expect(colourToCss(65280)).toBe('#00ff00') // pure green: R=0,G=0xFF,B=0
    expect(colourToCss(16711680)).toBe('#0000ff') // pure blue: R=0,G=0,B=0xFF
    expect(colourToCss(16777215)).toBe('#ffffff') // white
    expect(colourToCss(128)).toBe('#800000') // maroon-ish: R=0x80
    expect(colourToCss(32768)).toBe('#008000') // G=0x80
    expect(colourToCss(8388608)).toBe('#000080') // B=0x80
  })

  it('throws RangeError for out-of-range values', () => {
    expect(() => colourToCss(-1)).toThrow(RangeError)
    expect(() => colourToCss(0x1000000)).toThrow(RangeError)
  })

  it('throws RangeError for non-integers', () => {
    expect(() => colourToCss(1.5)).toThrow(RangeError)
  })
})

describe('cssToColour', () => {
  it('converts known reference values correctly (#rrggbb -> 0x00BBGGRR)', () => {
    expect(cssToColour('#000000')).toBe(0)
    expect(cssToColour('#ff0000')).toBe(255)
    expect(cssToColour('#00ff00')).toBe(65280)
    expect(cssToColour('#0000ff')).toBe(16711680)
    expect(cssToColour('#ffffff')).toBe(16777215)
  })

  it('accepts uppercase hex and missing leading #', () => {
    expect(cssToColour('FF0000')).toBe(255)
    expect(cssToColour('#FF0000')).toBe(255)
  })

  it('throws SyntaxError for malformed input', () => {
    expect(() => cssToColour('not-a-colour')).toThrow(SyntaxError)
    expect(() => cssToColour('#fff')).toThrow(SyntaxError)
    expect(() => cssToColour('#gggggg')).toThrow(SyntaxError)
  })
})

describe('colour codec round-trip (fuzz)', () => {
  it('cssToColour(colourToCss(x)) === x for all valid packed colours', () => {
    fc.assert(
      fc.property(fc.integer({ min: MIN_PACKED_COLOUR, max: MAX_PACKED_COLOUR }), (packed) => {
        expect(cssToColour(colourToCss(packed))).toBe(packed)
      }),
    )
  })

  it('colourToCss(cssToColour(x)) === x for all valid css hex strings', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 })),
        ([r, g, b]) => {
          const css = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
          expect(colourToCss(cssToColour(css))).toBe(css)
        },
      ),
    )
  })
})
