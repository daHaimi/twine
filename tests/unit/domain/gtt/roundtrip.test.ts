import { describe, expect, it } from 'vitest'

import { parseGtt } from '@/domain/gtt/parser'
import { serializeGtt } from '@/domain/gtt/serializer'

// Minimal hand-written GTT fixture exercising every structural feature we
// parse: cards with partially-unset hole colours, a pack, a card-mode pick,
// a pack-mode pick, twists, a palette with gaps, and preserved blocks.
const FIXTURE_GTT = `<?xml version="1.0" encoding="UTF-8"?>
<TWData>
  <Source>Guntram's Tabletweaving Thingy</Source>
  <Version>1.17</Version>
  <Release/>
  <Pattern Type="Threaded">
    <Name><![CDATA[Fixture Pattern]]></Name>
    <Notes>
      <L1><![CDATA[line one]]></L1>
      <L2/>
    </Notes>
    <Selvedges>
      <Left>
        <Cards Count="0"/>
      </Left>
      <Right>
        <Cards Count="0"/>
      </Right>
    </Selvedges>
    <Cards Count="2">
      <Card Holes="4" Number="1">
        <Holes Count="4">
          <Colour>1</Colour>
          <Colour>0</Colour>
          <Colour>2</Colour>
          <Colour>0</Colour>
        </Holes>
        <Threading>S</Threading>
        <CurThread>S</CurThread>
        <CurPos>0</CurPos>
        <CurHoles Count="4">
          <Colour>1</Colour>
          <Colour>0</Colour>
          <Colour>2</Colour>
          <Colour>0</Colour>
        </CurHoles>
      </Card>
      <Card Holes="4" Number="2">
        <Holes Count="4">
          <Colour>2</Colour>
          <Colour>2</Colour>
          <Colour>2</Colour>
          <Colour>2</Colour>
        </Holes>
        <Threading>Z</Threading>
      </Card>
    </Cards>
    <Packs Count="1">
      <Pack Name="PackA" TwineOrder="1">
        <Comment>test pack</Comment>
        <Size>2</Size>
        <Cards>1,2</Cards>
      </Pack>
    </Packs>
    <Picks Count="2">
      <Pick Index="0">
        <Actions Count="2">
          <Action Type="Turn" Target="Card" TargetID="1" Dir="F" Dist="1"/>
          <Action Type="Turn" Target="Card" TargetID="2" Dir="B" Dist="2"/>
        </Actions>
      </Pick>
      <Pick Index="1">
        <Actions Count="1">
          <Action Type="Twist" Target="Pack" TargetID="PackA" Dir="V"/>
        </Actions>
      </Pick>
    </Picks>
    <Palette Name="" Size="16">
      <Colour Index="1">0</Colour>
      <Colour Index="2">16777215</Colour>
    </Palette>
  </Pattern>
</TWData>`

describe('parseGtt', () => {
  it('parses cards, ignoring CurThread/CurPos/CurHoles', () => {
    const pattern = parseGtt(FIXTURE_GTT, 'id-1')
    expect(pattern.name).toBe('Fixture Pattern')
    expect(pattern.cards).toHaveLength(2)
    expect(pattern.cards[0]).toMatchObject({
      number: 1,
      holes: 4,
      threading: 'S',
      holeColours: [1, undefined, 2, undefined],
    })
    expect(pattern.cards[1]).toMatchObject({
      number: 2,
      holes: 4,
      threading: 'Z',
      holeColours: [2, 2, 2, 2],
    })
  })

  it('parses packs with TwineOrder', () => {
    const pattern = parseGtt(FIXTURE_GTT, 'id-1')
    expect(pattern.packs).toEqual([{ name: 'PackA', comment: 'test pack', order: 1, cardNumbers: [1, 2] }])
  })

  it('parses picks with correct mode and actions', () => {
    const pattern = parseGtt(FIXTURE_GTT, 'id-1')
    expect(pattern.picks).toHaveLength(2)
    expect(pattern.picks[0].mode).toBe('Card')
    expect(pattern.picks[0].actions.get('1')).toEqual({ type: 'Turn', dir: 'F', dist: 1 })
    expect(pattern.picks[0].actions.get('2')).toEqual({ type: 'Turn', dir: 'B', dist: 2 })
    expect(pattern.picks[1].mode).toBe('Pack')
    expect(pattern.picks[1].actions.get('PackA')).toEqual({ type: 'Twist', dir: 'V' })
  })

  it('parses the palette with gaps as unset', () => {
    const pattern = parseGtt(FIXTURE_GTT, 'id-1')
    expect(pattern.palette.colours[1]).toBe(0)
    expect(pattern.palette.colours[2]).toBe(16777215)
    expect(pattern.palette.colours[3]).toBeUndefined()
  })

  it('preserves Notes/Selvedges/Release verbatim markers', () => {
    const pattern = parseGtt(FIXTURE_GTT, 'id-1')
    expect(pattern.preserved.releasePresent).toBe(true)
    expect(pattern.preserved.notesRawXml).toContain('line one')
    expect(pattern.preserved.selvedgesRawXml).toContain('Left')
  })

  it('omits preserved blocks that are absent from the source', () => {
    const noExtras = FIXTURE_GTT.replace(/<Release\/>\r?\n?/, '')
      .replace(/<Notes>[\s\S]*?<\/Notes>\r?\n?/, '')
      .replace(/<Selvedges>[\s\S]*?<\/Selvedges>\r?\n?/, '')
    const pattern = parseGtt(noExtras, 'id-1')
    expect(pattern.preserved.releasePresent).toBe(false)
    expect(pattern.preserved.notesRawXml).toBeUndefined()
    expect(pattern.preserved.selvedgesRawXml).toBeUndefined()
  })

  it('rejects non-Threaded pattern types', () => {
    const bad = FIXTURE_GTT.replace('Type="Threaded"', 'Type="DoubleFace"')
    expect(() => parseGtt(bad, 'id-1')).toThrow(/only supports "Threaded"/)
  })
})

describe('parseGtt + serializeGtt round-trip against the reference example', () => {
  it('round-trips the real reference file structurally', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const refPath = path.resolve(__dirname, '../../../fixtures/10cOseberg12L1-aisling.gtt')
    const raw = fs.readFileSync(refPath, 'utf-8')

    const pattern = parseGtt(raw, 'oseberg')
    expect(pattern.cards).toHaveLength(10)
    expect(pattern.picks).toHaveLength(24)
    expect(pattern.name).toBe('Oseberg 12 L 1 - 4 pattern cards')
    expect(pattern.preserved.releasePresent).toBe(true)
    expect(pattern.preserved.notesRawXml).toContain('Silvia Aisling')
    expect(pattern.preserved.selvedgesRawXml).toContain('Left')

    const serialized = serializeGtt(pattern)
    const reparsed = parseGtt(serialized, 'oseberg')

    // Structural equality after a full round-trip (serialization intentionally
    // changes some byte-level details - TWINE Source/Version, CDATA Name,
    // computed CurPos/CurHoles - but the editable domain data must be stable).
    expect(reparsed.cards).toEqual(pattern.cards)
    expect(reparsed.packs).toEqual(pattern.packs)
    expect(reparsed.palette).toEqual(pattern.palette)
    expect(reparsed.picks).toEqual(pattern.picks)
    expect(reparsed.name).toBe(pattern.name)
    expect(reparsed.preserved).toEqual(pattern.preserved)
  })

  it('writes the mandated TWINE Source/Version and CDATA-wrapped Name', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const refPath = path.resolve(__dirname, '../../../fixtures/10cOseberg12L1-aisling.gtt')
    const raw = fs.readFileSync(refPath, 'utf-8')

    const pattern = parseGtt(raw, 'oseberg')
    const serialized = serializeGtt(pattern)

    expect(serialized.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(serialized).toContain('<Source>TWINE \u2013 Tablet Weaving INteractive Editor</Source>')
    expect(serialized).toContain('<Version>0.1</Version>')
    expect(serialized).toContain('<Name><![CDATA[Oseberg 12 L 1 - 4 pattern cards]]></Name>')
  })

  it('uses CRLF line endings and omits unset palette colours', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const refPath = path.resolve(__dirname, '../../../fixtures/10cOseberg12L1-aisling.gtt')
    const raw = fs.readFileSync(refPath, 'utf-8')

    const pattern = parseGtt(raw, 'oseberg')
    pattern.palette.colours[7] = undefined
    const serialized = serializeGtt(pattern)

    expect(serialized).toContain('\r\n')
    expect(serialized).not.toMatch(/<Colour Index="7">/)
  })
})
