/**
 * Domain model for the GTT "Threaded" pattern type (the only pattern type
 * TWINE supports; see PROJECT-PROMPT.md).
 *
 * These types are the framework-agnostic, pure in-memory representation of
 * a pattern. The GTT parser/serializer (`src/domain/gtt/`) convert between
 * this model and the on-disk XML representation; everything else in the
 * app (storage, state, UI) operates on these types.
 */

/** Thread spin direction assigned to a card. */
export type Threading = 'S' | 'Z'

/** Turn direction for a `Turn` action ("I" = idle, i.e. no turn). */
export type TurnDir = 'F' | 'B' | 'I'

/** The two action kinds a pick can contain. Twist has no directional effect modeled yet (see PROJECT-PROMPT.md). */
export type ActionType = 'Turn' | 'Twist'

/** What an action's `TargetID` refers to. */
export type ActionTarget = 'Card' | 'Pack'

/** Turn distance in holes; GTT only allows 1 or 2. */
export type TurnDistance = 1 | 2

/** A `Turn` action: forward/backward/idle, with an optional hole distance (defaults to 1 if omitted). */
export interface TurnAction {
  type: 'Turn'
  dir: TurnDir
  dist?: TurnDistance
}

/**
 * A `Twist` action. Per GTT, twists always rotate around the vertical axis
 * (`Dir="V"` is the only value defined) and never carry a `Dist` attribute.
 * Twists are fully editable/stored in this version but have no modeled
 * visual effect yet (see PROJECT-PROMPT.md "Picks" section) - they render
 * identically to Idle until a future stage implements their effect.
 */
export interface TwistAction {
  type: 'Twist'
  dir: 'V'
}

/**
 * A single action within a pick, as actually authored by the user (i.e.
 * non-idle, or explicitly-authored idle). Idle actions for
 * cards/packs *not* present in a pick's `actions` map are implied by the
 * "missing action defaults to Idle" rule and are not represented as
 * separate objects - see `resolveCardActions`.
 */
export type Action = TurnAction | TwistAction

/** The mode of a pick, determining whether its explicit actions key on card numbers or pack names. */
export type PickMode = 'Card' | 'Pack'

/**
 * One row of the picks grid / one `<Pick>` element.
 *
 * `actions` maps a target key (card `Number` as a string when `mode ===
 * 'Card'`, or pack `Name` when `mode === 'Pack'`) to the action performed on
 * that target for this pick. Targets absent from the map default to Idle
 * (per the GTT "missing action defaults to Idle" rule) - we therefore never
 * need to store explicit Idle entries, though doing so is harmless and
 * round-trips fine.
 */
export interface Pick {
  mode: PickMode
  actions: Map<string, Action>
}

/** A single hole's assigned palette colour slot; `undefined` means unset. */
export type HoleColourIndex = number | undefined

/** One tablet/card. `Number` is 1-based and must stay contiguous 1..CardCount within a Pattern. */
export interface Card {
  number: number
  holes: number
  /** Length always equals `holes`; palette index (1-16) per hole slot, or undefined if unset. */
  holeColours: HoleColourIndex[]
  threading: Threading
}

/** A named group of cards that can be acted on together in a Pack-mode pick. */
export interface Pack {
  name: string
  comment?: string
  /** TWINE-specific extension (not in base GTT): application order when multiple packs affect the same card in one pick. Unique per pattern. */
  order: number
  /** Card numbers belonging to this pack, 1-based. */
  cardNumbers: number[]
}

/** 16-slot colour palette; index 1-16, `undefined` entries are "unset" and omitted on export. */
export interface Palette {
  name: string
  /** Index 0 unused; valid indices are 1..16. Packed `0x00BBGGRR` integers or undefined if unset. */
  colours: (number | undefined)[]
}

/**
 * Verbatim-preserved blocks that TWINE's UI never edits but must round-trip
 * unchanged if present on load (see PROJECT-PROMPT.md). We keep their raw
 * inner XML string; `undefined` means absent (and therefore omitted again
 * on save, never synthesized).
 */
export interface PreservedBlocks {
  notesRawXml?: string
  selvedgesRawXml?: string
  /** `<Release/>` is a presence-only marker element with no content. */
  releasePresent: boolean
}

/** The complete in-memory representation of a Threaded GTT pattern. */
export interface Pattern {
  /** Local identifier (IndexedDB key), not part of the GTT format itself. */
  id: string
  name: string
  cards: Card[]
  packs: Pack[]
  palette: Palette
  picks: Pick[]
  preserved: PreservedBlocks
}

/** Hard format/UX limits enforced throughout the domain layer. */
export const LIMITS = {
  MIN_HOLES: 3,
  MAX_HOLES: 8,
  MAX_CARDS: 140,
  MAX_PICKS: 128,
  PALETTE_SIZE: 16,
} as const
