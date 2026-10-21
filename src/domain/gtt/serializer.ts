import type { Action, Card, Pack, Palette, Pattern, Pick } from '@/domain/model/pattern'
import { simulateAllCards } from '@/domain/simulation'

/**
 * GTT XML serializer (Threaded pattern type only).
 *
 * Produces a GTT XML document string from a `Pattern`, matching the
 * reference file `10cOseberg12L1-aisling.gtt` byte-for-byte in every
 * respect the format leaves unspecified (CRLF line endings, 2-space
 * indentation - see IMPLEMENTATION-PLAN.md decisions #5/#6), plus the
 * TWINE-specific requirements from PROJECT-PROMPT.md:
 *  - A leading `<?xml?>` declaration (absent from the reference file, but
 *    explicitly mandated for TWINE's own downloads).
 *  - `<Source>` = "TWINE – Tablet Weaving INteractive Editor", `<Version>`
 *    = "0.1".
 *  - `<Name>` wrapped in CDATA.
 *  - Unset palette colours omitted entirely (no sentinel element).
 *  - Freshly-simulated `CurThread`/`CurPos`/`CurHoles` per card.
 *  - `Notes`/`Selvedges`/`Release` preserved verbatim if present on load, or
 *    omitted (never synthesized) if they were absent.
 *  - A TWINE-proprietary `TwineOrder` attribute on `<Pack>` for the pack
 *    application-order extension (always written, even though it is not
 *    part of the base GTT definition - see PROJECT-PROMPT.md "TWINE-
 *    Proprietary data will be added ... even if not present in the
 *    definition").
 *
 * A hole whose colour slot is unset is serialized as palette index `0`
 * (outside the valid 1-16 range, therefore unambiguous as "no colour") -
 * this is a documented TWINE implementation choice distinct from the
 * palette's own unset-colour-omission rule, since the `<Holes Count=N>`
 * element count must stay equal to the card's hole count and so entries
 * cannot simply be omitted there.
 */

const CRLF = '\r\n'
const INDENT = '  '

export function serializeGtt(pattern: Pattern): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<TWData>')
  lines.push(indent(1) + '<Source>TWINE \u2013 Tablet Weaving INteractive Editor</Source>')
  lines.push(indent(1) + '<Version>0.1</Version>')
  if (pattern.preserved.releasePresent) {
    lines.push(indent(1) + '<Release/>')
  }
  lines.push(indent(1) + '<Pattern Type="Threaded">')
  lines.push(indent(2) + `<Name><![CDATA[${pattern.name}]]></Name>`)

  if (pattern.preserved.notesRawXml !== undefined) {
    lines.push(...wrapPreserved('Notes', pattern.preserved.notesRawXml, 2))
  }
  if (pattern.preserved.selvedgesRawXml !== undefined) {
    lines.push(...wrapPreserved('Selvedges', pattern.preserved.selvedgesRawXml, 2))
  }

  lines.push(...serializeCards(pattern, 2))
  lines.push(...serializePacks(pattern.packs, 2))
  lines.push(...serializePicks(pattern.picks, 2))
  lines.push(...serializePalette(pattern.palette, 2))

  lines.push(indent(1) + '</Pattern>')
  lines.push('</TWData>')

  return lines.join(CRLF) + CRLF
}

function serializeCards(pattern: Pattern, level: number): string[] {
  const { cards, picks, packs } = pattern
  const simulated = simulateAllCards(cards, picks, packs)
  const lines: string[] = []

  lines.push(indent(level) + `<Cards Count="${cards.length}">`)
  for (const card of cards) {
    const sim = simulated.get(card.number)
    lines.push(indent(level + 1) + `<Card Holes="${card.holes}" Number="${card.number}">`)
    lines.push(...serializeHoleColours('Holes', card.holeColours, level + 2))
    lines.push(indent(level + 2) + `<Threading>${card.threading}</Threading>`)
    if (sim) {
      lines.push(indent(level + 2) + `<CurThread>${sim.curThread}</CurThread>`)
      lines.push(indent(level + 2) + `<CurPos>${sim.curPos}</CurPos>`)
      lines.push(...serializeHoleColours('CurHoles', sim.curHoles, level + 2))
    }
    lines.push(indent(level + 1) + '</Card>')
  }
  lines.push(indent(level) + '</Cards>')

  return lines
}

/** Serializes a Card's `<Holes>`/`<CurHoles>` block, using palette index 0 as the "unset" sentinel (see module doc). */
function serializeHoleColours(tag: 'Holes' | 'CurHoles', colours: readonly (number | undefined)[], level: number): string[] {
  const lines: string[] = []
  lines.push(indent(level) + `<${tag} Count="${colours.length}">`)
  for (const colour of colours) {
    lines.push(indent(level + 1) + `<Colour>${colour ?? 0}</Colour>`)
  }
  lines.push(indent(level) + `</${tag}>`)
  return lines
}

function serializePacks(packs: readonly Pack[], level: number): string[] {
  if (packs.length === 0) {
    return [indent(level) + '<Packs Count="0"/>']
  }

  const lines: string[] = []
  lines.push(indent(level) + `<Packs Count="${packs.length}">`)
  for (const pack of packs) {
    lines.push(indent(level + 1) + `<Pack Name="${escapeAttr(pack.name)}" TwineOrder="${pack.order}">`)
    if (pack.comment !== undefined) {
      lines.push(indent(level + 2) + `<Comment>${escapeText(pack.comment)}</Comment>`)
    }
    lines.push(indent(level + 2) + `<Size>${pack.cardNumbers.length}</Size>`)
    lines.push(indent(level + 2) + `<Cards>${pack.cardNumbers.join(',')}</Cards>`)
    lines.push(indent(level + 1) + '</Pack>')
  }
  lines.push(indent(level) + '</Packs>')

  return lines
}

function serializePicks(picks: readonly Pick[], level: number): string[] {
  const lines: string[] = []
  lines.push(indent(level) + `<Picks Count="${picks.length}">`)

  picks.forEach((pick, index) => {
    lines.push(indent(level + 1) + `<Pick Index="${index}">`)
    const entries = Array.from(pick.actions.entries())
    lines.push(indent(level + 2) + `<Actions Count="${entries.length}">`)
    for (const [targetId, action] of entries) {
      lines.push(indent(level + 3) + serializeAction(pick.mode, targetId, action))
    }
    lines.push(indent(level + 2) + '</Actions>')
    lines.push(indent(level + 1) + '</Pick>')
  })

  lines.push(indent(level) + '</Picks>')
  return lines
}

function serializeAction(mode: Pick['mode'], targetId: string, action: Action): string {
  const target = mode
  if (action.type === 'Twist') {
    return `<Action Type="Twist" Target="${target}" TargetID="${escapeAttr(targetId)}" Dir="V"/>`
  }
  const dist = action.dist ?? 1
  return `<Action Type="Turn" Target="${target}" TargetID="${escapeAttr(targetId)}" Dir="${action.dir}" Dist="${dist}"/>`
}

function serializePalette(palette: Palette, level: number): string[] {
  const lines: string[] = []
  lines.push(indent(level) + `<Palette Name="${escapeAttr(palette.name)}" Size="16">`)
  for (let i = 1; i <= 16; i += 1) {
    const value = palette.colours[i]
    if (value !== undefined) {
      lines.push(indent(level + 1) + `<Colour Index="${i}">${value}</Colour>`)
    }
  }
  lines.push(indent(level) + '</Palette>')
  return lines
}

/** Wraps a verbatim-preserved raw-XML block (already-serialized children) in its own indented container tag, re-indenting nested elements according to their actual tag depth. */
function wrapPreserved(tag: string, rawXml: string, level: number): string[] {
  if (rawXml.trim().length === 0) {
    return [indent(level) + `<${tag}/>`]
  }

  const innerLines = rawXml
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const lines: string[] = [indent(level) + `<${tag}>`]
  let depth = level + 1
  for (const line of innerLines) {
    const isClosingTag = /^<\/[^>]+>$/.test(line)
    const isSelfClosingOrPaired = /^<[^/][^>]*\/>$/.test(line) || /^<([A-Za-z0-9_]+)[^>]*>.*<\/\1>$/.test(line)
    const isOpeningTag = !isClosingTag && !isSelfClosingOrPaired

    if (isClosingTag) {
      depth -= 1
    }
    lines.push(indent(depth) + line)
    if (isOpeningTag) {
      depth += 1
    }
  }
  lines.push(indent(level) + `</${tag}>`)

  return lines
}

function indent(level: number): string {
  return INDENT.repeat(level)
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Re-exported for tests that need to construct a Card/Pattern inline without
// importing from the model module directly.
export type { Card }
