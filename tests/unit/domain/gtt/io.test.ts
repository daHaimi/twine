import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadPattern, GttFileReadError, gttFilenameFor, readGttFile } from '@/domain/gtt/io'
import type { Pattern } from '@/domain/model/pattern'

function minimalPattern(name: string): Pattern {
  return {
    id: 'x',
    name,
    cards: [],
    packs: [],
    palette: { name: '', colours: Array.from({ length: 17 }, () => undefined) },
    picks: [],
    preserved: { releasePresent: false },
  }
}

const MINIMAL_GTT_XML = `<TWData>
  <Pattern Type="Threaded">
    <Name><![CDATA[Imported]]></Name>
    <Cards Count="0"/>
    <Packs Count="0"/>
    <Picks Count="0"/>
    <Palette/>
  </Pattern>
</TWData>`

describe('readGttFile', () => {
  it('parses a valid GTT File into a Pattern with the given id', async () => {
    const file = new File([MINIMAL_GTT_XML], 'imported.gtt', { type: 'application/xml' })
    const pattern = await readGttFile(file, 'assigned-id')
    expect(pattern.id).toBe('assigned-id')
    expect(pattern.name).toBe('Imported')
  })

  it('wraps a file-read failure in a GttFileReadError', async () => {
    const brokenFile = { name: 'broken.gtt', text: () => Promise.reject(new Error('boom')) } as unknown as File
    await expect(readGttFile(brokenFile, 'id')).rejects.toBeInstanceOf(GttFileReadError)
    await expect(readGttFile(brokenFile, 'id')).rejects.toThrow(/broken\.gtt/)
  })
})

describe('downloadPattern', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clickSpy.mockRestore()
  })

  it('creates a Blob URL, clicks a download anchor with the right filename, and revokes the URL', () => {
    downloadPattern(minimalPattern('My Pattern'))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})

describe('gttFilenameFor', () => {
  it('appends .gtt to a simple name', () => {
    expect(gttFilenameFor(minimalPattern('MyPattern'))).toBe('MyPattern.gtt')
  })

  it('replaces filesystem-unsafe characters', () => {
    expect(gttFilenameFor(minimalPattern('a/b:c*d?e"f<g>h|i'))).toBe('a_b_c_d_e_f_g_h_i.gtt')
  })

  it('trims surrounding whitespace', () => {
    expect(gttFilenameFor(minimalPattern('  Spaced  '))).toBe('Spaced.gtt')
  })

  it('falls back to "pattern.gtt" for an empty/whitespace-only name', () => {
    expect(gttFilenameFor(minimalPattern(''))).toBe('pattern.gtt')
    expect(gttFilenameFor(minimalPattern('   '))).toBe('pattern.gtt')
  })

  it('always produces a filename free of path-unsafe characters (fuzz)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 50 }), (name) => {
        const filename = gttFilenameFor(minimalPattern(name))
        expect(filename.endsWith('.gtt')).toBe(true)
        expect(filename).not.toMatch(/[\\/:*?"<>|]/)
      }),
    )
  })
})
