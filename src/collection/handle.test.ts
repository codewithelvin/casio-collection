import { describe, expect, it } from 'vitest'
import { normaliseHandle, profileUrl, validateHandle } from './handle.ts'

/**
 * FR-7.2 — a handle becomes a public URL, so what this refuses is not a
 * validation nicety. Every case below is either a route collision or a way to
 * look like this site.
 */

describe('the shape of a handle', () => {
  it('accepts what the requirement describes', () => {
    for (const good of ['elvin', 'a1b', 'casio-lover', 'square_1989', '0000', 'a'.repeat(30)]) {
      expect(validateHandle(good), good).toEqual({ ok: true })
    }
  })

  it('refuses lengths outside 3 to 30, and says which', () => {
    expect(validateHandle('ab')).toEqual({ ok: false, reason: 'too-short' })
    expect(validateHandle('a'.repeat(31))).toEqual({ ok: false, reason: 'too-long' })
  })

  /**
   * Length is checked before shape on purpose. "Three characters at least" is a
   * sentence somebody can act on; telling them a two-letter name is malformed
   * is true and useless.
   */
  it('reports a short handle as short rather than as malformed', () => {
    expect(validateHandle('A!')).toEqual({ ok: false, reason: 'too-short' })
  })

  it('refuses characters that do not belong in a path segment', () => {
    for (const bad of ['Elvin Huseynov', 'elvin.huseynov', 'elvin/collection', 'élvin', 'e@vin']) {
      expect(validateHandle(bad), bad).toMatchObject({ ok: false })
    }
  })

  it('refuses a handle starting with a hyphen or an underscore', () => {
    expect(validateHandle('-elvin')).toEqual({ ok: false, reason: 'shape' })
    expect(validateHandle('_elvin')).toEqual({ ok: false, reason: 'shape' })
  })

  /** Uppercase is normalised rather than refused — `Elvin` is a fine handle. */
  it('accepts uppercase by lowering it', () => {
    expect(validateHandle('Elvin')).toEqual({ ok: true })
    expect(normaliseHandle('  Elvin  ')).toBe('elvin')
  })
})

describe('reserved words', () => {
  it('refuses the paths this app already routes on', () => {
    for (const taken of ['settings', 'collection', 'search', 'watch', 'auth', 'about']) {
      expect(validateHandle(taken), taken).toEqual({ ok: false, reason: 'reserved' })
    }
  })

  /**
   * `u` is on the reserved list and is also one character, so the length rule
   * refuses it first and it never reaches the list. Both answers are a refusal
   * and that is what matters — asserting the *reason* here would be pinning an
   * ordering that exists for the sake of a readable message, not for safety.
   * It stays on the list because the day the minimum changes is not the day
   * anyone will remember why `/u/u` was a problem.
   */
  it('refuses a single-letter route name, by whichever rule gets there first', () => {
    expect(validateHandle('u').ok).toBe(false)
  })

  /**
   * The other half of the list, and the half that is about people rather than
   * routing: `admin` and `support` are what a phishing message claims to be
   * from, and `/u/casio` on a site that looks like this one is a problem no
   * disclaimer in the footer fixes.
   */
  it('refuses words that let a stranger speak for the site', () => {
    for (const taken of ['admin', 'support', 'casio', 'official', 'casiovault']) {
      expect(validateHandle(taken), taken).toEqual({ ok: false, reason: 'reserved' })
    }
  })

  /**
   * The line slugs are passed in rather than copied into the list, because a
   * copy stops agreeing the day a ninth line is added — and by then somebody
   * owns `/u/edifice`, and D2 says an id is permanent.
   */
  it('refuses the line slugs it is given, and only those', () => {
    expect(validateHandle('g-shock', ['g-shock', 'vintage'])).toEqual({
      ok: false,
      reason: 'reserved',
    })
    expect(validateHandle('g-shock')).toEqual({ ok: true })
  })

  it('refuses a reserved word however it was typed', () => {
    expect(validateHandle('  AdMiN ')).toEqual({ ok: false, reason: 'reserved' })
  })
})

describe('the public address', () => {
  it('is the handle under /u/, normalised', () => {
    expect(profileUrl('https://casiovault.com', ' Elvin ')).toBe('https://casiovault.com/u/elvin')
  })
})
