import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { nextCloneName, stripCloneSuffix } from '@/domain/naming'

describe('stripCloneSuffix', () => {
  it('strips a trailing -<N> suffix', () => {
    expect(stripCloneSuffix('Foo-1')).toBe('Foo')
    expect(stripCloneSuffix('Foo-12')).toBe('Foo')
  })

  it('leaves names without a numeric suffix unchanged', () => {
    expect(stripCloneSuffix('Foo')).toBe('Foo')
    expect(stripCloneSuffix('Foo-')).toBe('Foo-')
    expect(stripCloneSuffix('Foo-bar')).toBe('Foo-bar')
  })
})

describe('nextCloneName', () => {
  it('yields "Foo-1" when cloning "Foo" with no collisions', () => {
    expect(nextCloneName('Foo', ['Foo'])).toBe('Foo-1')
  })

  it('yields "Foo-2" when cloning "Foo" and "Foo-1" already exists', () => {
    expect(nextCloneName('Foo', ['Foo', 'Foo-1'])).toBe('Foo-2')
  })

  it('yields "Foo-2" (not "Foo-1-1") when cloning "Foo-1" and "Foo-1" exists', () => {
    // Base name for suffixing purposes is "Foo" (suffix stripped first).
    expect(nextCloneName('Foo-1', ['Foo', 'Foo-1'])).toBe('Foo-2')
  })

  it('fills the lowest unused gap, not just max+1', () => {
    expect(nextCloneName('Foo', ['Foo', 'Foo-1', 'Foo-3'])).toBe('Foo-2')
  })

  it('is unaffected by unrelated names sharing a prefix', () => {
    expect(nextCloneName('Foo', ['Foo', 'FooBar', 'Foo-Bar'])).toBe('Foo-1')
  })
})

describe('nextCloneName (fuzz)', () => {
  it('always returns a name not already present in existingNames', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), fc.array(fc.string({ minLength: 1, maxLength: 20 })), (name, others) => {
        const existing = [name, ...others]
        const result = nextCloneName(name, existing)
        expect(existing).not.toContain(result)
      }),
    )
  })

  it('always produces a name matching "<base>-<positive integer>"', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), fc.array(fc.string({ minLength: 1, maxLength: 20 })), (name, others) => {
        const base = stripCloneSuffix(name)
        const existing = [name, ...others]
        const result = nextCloneName(name, existing)
        expect(result).toMatch(/-\d+$/)
        expect(result.startsWith(`${base}-`)).toBe(true)
      }),
    )
  })

  it('round-tripping a clone of a clone keeps the same base and increments', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/-\d+$/.test(s)), (base) => {
        const first = nextCloneName(base, [base])
        expect(first).toBe(`${base}-1`)
        const second = nextCloneName(first, [base, first])
        expect(second).toBe(`${base}-2`)
      }),
    )
  })
})
