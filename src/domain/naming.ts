/**
 * Naming utility for clone/duplicate operations on named entities (Patterns,
 * Packs, Snippets).
 *
 * Rule (see PROJECT-PROMPT.md):
 *   All named entities that can be copied get suffixed by "-<Number>" on
 *   clone/duplicate-name creation, using the lowest unused integer starting
 *   at "-1" for that base name - e.g. cloning "Foo" when "Foo-1" already
 *   exists yields "Foo-2", not "Foo-1-1" (the base name for suffixing
 *   purposes is the name with any existing "-<Number>" suffix stripped
 *   first).
 */

/** Matches a trailing "-<positive integer>" suffix, e.g. "Foo-12" -> "-12". */
const TRAILING_NUMBER_SUFFIX = /-(\d+)$/

/**
 * Strips any existing trailing "-<Number>" suffix from a name, returning the
 * "base name" used for suffix-collision checks.
 *
 * Examples:
 *   "Foo"      -> "Foo"
 *   "Foo-1"    -> "Foo"
 *   "Foo-12"   -> "Foo"
 *   "Foo-"     -> "Foo-"   (not a valid numeric suffix, left untouched)
 *   "Foo-0"    -> "Foo"    (strips even unusual "-0"; see note below)
 */
export function stripCloneSuffix(name: string): string {
  const match = TRAILING_NUMBER_SUFFIX.exec(name)
  if (!match) {
    return name
  }
  return name.slice(0, name.length - match[0].length)
}

/**
 * Computes the clone name for `name` given the set of `existingNames`
 * already in use (e.g. all pattern names currently stored).
 *
 * The base name is first derived by stripping any existing "-<Number>"
 * suffix from `name`. The result is `${base}-${n}` where `n` is the lowest
 * positive integer such that `${base}-${n}` is not already present in
 * `existingNames`.
 *
 * `existingNames` is treated as the full set of names in use *before* the
 * clone is created (i.e. it should normally include `name` itself, since
 * that's the entity being cloned).
 */
export function nextCloneName(name: string, existingNames: Iterable<string>): string {
  const base = stripCloneSuffix(name)
  const used = new Set(existingNames)

  let n = 1
  while (used.has(`${base}-${n}`)) {
    n += 1
  }
  return `${base}-${n}`
}
