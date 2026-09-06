import { describe, expect, it } from 'vitest'
import {
  ABOUT_MAX,
  LINK_PLATFORMS,
  LOCATION_MAX,
  ageFromBirthYear,
  buildLinkUrl,
  emptyToNull,
  isValidAbout,
  isValidBirthYear,
  isValidLink,
  isValidLocation,
  linkLabel,
  normaliseLinkHandle,
  normaliseWebsite,
} from './profileFields.ts'

/**
 * D31 — these are the functions that decide what a stranger's browser is told to
 * load, and every one of them fails quietly. A link built wrong is a link to
 * somewhere else; an age derived wrong is a number nobody checks.
 */

const NOW = new Date('2026-09-06T12:00:00Z')

describe('buildLinkUrl — the site builds the address (S10)', () => {
  it.each([
    ['instagram', 'casiofan', 'https://instagram.com/casiofan'],
    ['x', 'casiofan', 'https://x.com/casiofan'],
    ['reddit', 'casiofan', 'https://reddit.com/user/casiofan'],
    ['youtube', 'casiofan', 'https://youtube.com/@casiofan'],
    ['tiktok', 'casiofan', 'https://tiktok.com/@casiofan'],
    ['facebook', 'casiofan', 'https://facebook.com/casiofan'],
    ['github', 'casiofan', 'https://github.com/casiofan'],
  ] as const)('%s', (platform, handle, expected) => {
    expect(buildLinkUrl(platform, handle)).toBe(expected)
  })

  it('returns a website unchanged, because there is nothing to build', () => {
    expect(buildLinkUrl('website', 'https://example.com/watches')).toBe(
      'https://example.com/watches',
    )
  })

  /**
   * The belt to the shape check's braces. A handle that somehow reached this
   * function without passing `isValidLink` still cannot leave its path segment
   * — the point being that no input produces an href pointing at another host.
   */
  it('cannot be escaped out of its path segment', () => {
    expect(buildLinkUrl('github', '../../evil')).toBe('https://github.com/..%2F..%2Fevil')
    expect(buildLinkUrl('x', 'a?b#c')).toBe('https://x.com/a%3Fb%23c')
  })

  it('strips the @ people paste out of habit', () => {
    expect(buildLinkUrl('instagram', '@casiofan')).toBe('https://instagram.com/casiofan')
    expect(normaliseLinkHandle('x', '  @@casiofan  ')).toBe('casiofan')
  })

  it('builds an address for every platform in the list', () => {
    for (const platform of LINK_PLATFORMS) {
      const handle = platform === 'website' ? 'https://example.com' : 'someone'
      expect(buildLinkUrl(platform, handle)).toMatch(/^https:\/\//)
    }
  })
})

describe('isValidLink', () => {
  it('accepts the shapes 0005 accepts', () => {
    expect(isValidLink('github', 'casio-fan_1.0')).toBe(true)
    expect(isValidLink('website', 'https://example.com')).toBe(true)
    expect(isValidLink('website', 'https://example.com/a/b?c=d')).toBe(true)
  })

  it.each([
    ['an empty handle', 'github', ''],
    ['a space', 'github', 'casio fan'],
    ['a slash', 'github', 'casio/fan'],
    ['over forty characters', 'github', 'a'.repeat(41)],
    ['http rather than https', 'website', 'http://example.com'],
    ['a javascript: URL', 'website', 'javascript:alert(1)'],
    ['a data: URL', 'website', 'data:text/html,<script>'],
    ['a bare host', 'website', 'example.com'],
    ['a protocol-relative URL', 'website', '//example.com'],
    ['no dot in the host', 'website', 'https://localhost'],
  ] as const)('refuses %s', (_why, platform, handle) => {
    expect(isValidLink(platform, handle)).toBe(false)
  })

  it('refuses a website over the length the database allows', () => {
    expect(isValidLink('website', `https://example.com/${'a'.repeat(200)}`)).toBe(false)
  })

  /**
   * Hosts are case-insensitive and paths are not, and 0005's check is written in
   * lower case — so a form that accepted `HTTPS://Example.com` unchanged would
   * produce a save the database refuses with a message nobody can act on.
   */
  it('lower-cases the scheme and host and leaves the path alone', () => {
    expect(normaliseWebsite('HTTPS://Example.COM/MyWatches')).toBe(
      'https://example.com/MyWatches',
    )
    expect(isValidLink('website', 'HTTPS://Example.COM')).toBe(true)
  })

  it('leaves something that is not an address alone rather than mangling it', () => {
    expect(normaliseWebsite('not a url')).toBe('not a url')
  })
})

describe('linkLabel — what the reader sees is not the address', () => {
  it('is @handle everywhere but a website', () => {
    expect(linkLabel('instagram', 'casiofan')).toBe('@casiofan')
  })

  it('is the host for a website, without www', () => {
    expect(linkLabel('website', 'https://www.example.com/watches')).toBe('example.com')
    expect(linkLabel('website', 'https://example.com')).toBe('example.com')
  })

  it('falls back to the value when there is no host to find', () => {
    expect(linkLabel('website', 'nonsense')).toBe('nonsense')
  })
})

describe('ageFromBirthYear — derived, never stored (D70)', () => {
  it('is the age they reach this year', () => {
    expect(ageFromBirthYear(1988, NOW)).toBe(38)
  })

  it.each([
    ['absent', null],
    ['undefined', undefined],
    ['before 1900', 1899],
    ['not an integer', 1988.5],
  ] as const)('returns null for %s', (_why, year) => {
    expect(ageFromBirthYear(year, NOW)).toBeNull()
  })

  it('returns null rather than a negative age for a year in the future', () => {
    expect(ageFromBirthYear(2030, NOW)).toBeNull()
  })

  it('is zero, not null, in the year somebody was born', () => {
    expect(ageFromBirthYear(2026, NOW)).toBe(0)
  })
})

describe('the bounds, which are the database’s and are copied here (S5)', () => {
  it('accepts a year this trigger would accept', () => {
    expect(isValidBirthYear(1988, NOW)).toBe(true)
    expect(isValidBirthYear(2026, NOW)).toBe(true)
    expect(isValidBirthYear(null, NOW)).toBe(true)
  })

  it('refuses what 0005 would raise on', () => {
    expect(isValidBirthYear(2027, NOW)).toBe(false)
    expect(isValidBirthYear(1899, NOW)).toBe(false)
    expect(isValidBirthYear(1988.5, NOW)).toBe(false)
  })

  it('bounds about and location at the same lengths as the checks', () => {
    expect(isValidAbout('a'.repeat(ABOUT_MAX))).toBe(true)
    expect(isValidAbout('a'.repeat(ABOUT_MAX + 1))).toBe(false)
    expect(isValidLocation('a'.repeat(LOCATION_MAX))).toBe(true)
    expect(isValidLocation('a'.repeat(LOCATION_MAX + 1))).toBe(false)
  })
})

describe('emptyToNull — absent and empty must not be two states', () => {
  it.each([
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    ['  Baku  ', 'Baku'],
  ] as const)('%s → %s', (input, expected) => {
    expect(emptyToNull(input)).toBe(expected)
  })
})
