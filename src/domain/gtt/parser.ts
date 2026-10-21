import type { Action, ActionType, Card, Pack, Palette, Pattern, Pick, PickMode, TurnDir } from '@/domain/model/pattern'

/**
 * GTT XML parser (Threaded pattern type only).
 *
 * Parses a GTT XML document string into the in-memory `Pattern` model.
 * `CurThread`/`CurPos`/`CurHoles` are intentionally ignored here - per
 * PROJECT-PROMPT.md, TWINE always recomputes these from `Holes`,
 * `Threading`, and `Picks` rather than trusting the stored cache values
 * (see `src/domain/simulation.ts`).
 *
 * Any XML tags not understood by this parser are simply never read (and
 * therefore implicitly ignored), per the "Any undescribed XML Tags are
 * ignored" rule - except for the specific preserved-verbatim blocks
 * (`Notes`, `Selvedges`, `Release`) which are captured so they can be
 * written back unchanged on save.
 */

export class GttParseError extends Error {}

/** Parses a full GTT XML document string into a `Pattern`. `id` is the local storage key to assign (not part of the XML itself). */
export function parseGtt(xml: string, id: string): Pattern {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')

  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new GttParseError(`Failed to parse GTT XML: ${parserError.textContent ?? 'unknown error'}`)
  }

  const twData = doc.documentElement
  if (!twData || twData.nodeName !== 'TWData') {
    throw new GttParseError(`Expected root element <TWData>, got <${twData?.nodeName ?? 'none'}>`)
  }

  const patternEl = findChild(twData, 'Pattern')
  if (!patternEl) {
    throw new GttParseError('Missing <Pattern> element')
  }

  const type = patternEl.getAttribute('Type')
  if (type !== 'Threaded') {
    throw new GttParseError(`Unsupported Pattern Type "${type}" - TWINE only supports "Threaded"`)
  }

  const name = findChild(patternEl, 'Name')?.textContent ?? ''

  const cards = parseCards(patternEl)
  const packs = parsePacks(patternEl)
  const palette = parsePalette(patternEl)
  const picks = parsePicks(patternEl)

  const notesEl = findChild(patternEl, 'Notes')
  const selvedgesEl = findChild(patternEl, 'Selvedges')
  const releaseEl = findChild(twData, 'Release')

  return {
    id,
    name,
    cards,
    packs,
    palette,
    picks,
    preserved: {
      notesRawXml: notesEl ? serializeChildren(notesEl) : undefined,
      selvedgesRawXml: selvedgesEl ? serializeChildren(selvedgesEl) : undefined,
      releasePresent: releaseEl !== null,
    },
  }
}

function parseCards(patternEl: Element): Card[] {
  const cardsEl = findChild(patternEl, 'Cards')
  if (!cardsEl) {
    return []
  }

  const cards: Card[] = []
  for (const cardEl of findChildren(cardsEl, 'Card')) {
    const holes = parseIntAttr(cardEl, 'Holes')
    const number = parseIntAttr(cardEl, 'Number')
    const threading = findChild(cardEl, 'Threading')?.textContent?.trim() === 'Z' ? 'Z' : 'S'

    const holeColours: (number | undefined)[] = Array.from({ length: holes }, () => undefined)
    const holesEl = findChild(cardEl, 'Holes')
    if (holesEl) {
      const colourEls = findChildren(holesEl, 'Colour')
      colourEls.forEach((colourEl, i) => {
        if (i < holes) {
          const text = colourEl.textContent?.trim()
          const parsed = text ? Number.parseInt(text, 10) : undefined
          // Palette index 0 is TWINE's sentinel for "no colour assigned" to
          // this hole (see IMPLEMENTATION-PLAN.md decision #20); treat it as
          // unset rather than a literal (invalid) palette index.
          holeColours[i] = parsed && parsed > 0 ? parsed : undefined
        }
      })
    }

    cards.push({ number, holes, holeColours, threading })
  }

  return cards.sort((a, b) => a.number - b.number)
}

function parsePacks(patternEl: Element): Pack[] {
  const packsEl = findChild(patternEl, 'Packs')
  if (!packsEl) {
    return []
  }

  return findChildren(packsEl, 'Pack').map((packEl, index) => {
    const name = packEl.getAttribute('Name') ?? ''
    const comment = findChild(packEl, 'Comment')?.textContent ?? undefined
    const cardsText = findChild(packEl, 'Cards')?.textContent?.trim() ?? ''
    const cardNumbers = cardsText.length
      ? cardsText
          .split(',')
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n))
      : []

    // Order is a TWINE-specific extension absent from base GTT files; when
    // missing, assign ascending default order based on document position.
    const orderAttr = packEl.getAttribute('TwineOrder')
    const order = orderAttr !== null ? Number.parseInt(orderAttr, 10) : index + 1

    return { name, comment, order, cardNumbers }
  })
}

function parsePalette(patternEl: Element): Palette {
  const paletteEl = findChild(patternEl, 'Palette')
  const name = paletteEl?.getAttribute('Name') ?? ''
  const colours: (number | undefined)[] = Array.from({ length: 17 }, () => undefined)

  if (paletteEl) {
    for (const colourEl of findChildren(paletteEl, 'Colour')) {
      const index = parseIntAttr(colourEl, 'Index')
      const text = colourEl.textContent?.trim()
      if (index >= 1 && index <= 16 && text) {
        colours[index] = Number.parseInt(text, 10)
      }
    }
  }

  return { name, colours }
}

function parsePicks(patternEl: Element): Pick[] {
  const picksEl = findChild(patternEl, 'Picks')
  if (!picksEl) {
    return []
  }

  return findChildren(picksEl, 'Pick')
    .sort((a, b) => parseIntAttr(a, 'Index') - parseIntAttr(b, 'Index'))
    .map((pickEl) => parsePick(pickEl))
}

function parsePick(pickEl: Element): Pick {
  const actionsEl = findChild(pickEl, 'Actions')
  const actionEls = actionsEl ? findChildren(actionsEl, 'Action') : []

  let mode: PickMode = 'Card'
  const actions = new Map<string, Action>()

  actionEls.forEach((actionEl, i) => {
    const target = actionEl.getAttribute('Target') === 'Pack' ? 'Pack' : 'Card'
    if (i === 0) {
      mode = target
    }
    const targetId = actionEl.getAttribute('TargetID') ?? ''
    const type: ActionType = actionEl.getAttribute('Type') === 'Twist' ? 'Twist' : 'Turn'

    let action: Action
    if (type === 'Twist') {
      action = { type: 'Twist', dir: 'V' }
    } else {
      const dirAttr = actionEl.getAttribute('Dir')
      const dir: TurnDir = dirAttr === 'F' || dirAttr === 'B' ? dirAttr : 'I'
      const distAttr = actionEl.getAttribute('Dist')
      const dist = distAttr === '2' ? 2 : distAttr === '1' ? 1 : undefined
      action = { type: 'Turn', dir, dist }
    }

    actions.set(targetId, action)
  })

  return { mode, actions }
}

function findChild(parent: Element, tagName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) {
      return child
    }
  }
  return null
}

function findChildren(parent: Element, tagName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.tagName === tagName)
}

function parseIntAttr(el: Element, attr: string): number {
  const text = el.getAttribute(attr)
  const value = text !== null ? Number.parseInt(text, 10) : NaN
  if (!Number.isFinite(value)) {
    throw new GttParseError(`Expected integer attribute "${attr}" on <${el.tagName}>, got "${text}"`)
  }
  return value
}

/** Serializes just the children of `el` back to an XML string, for verbatim-preservation of unmodified blocks. */
function serializeChildren(el: Element): string {
  const serializer = new XMLSerializer()
  return Array.from(el.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('')
}
