/**
 * The plural bug, and the reason this file exists at all.
 *
 * `seriesTitle` concatenated a count onto a fixed noun, so
 * `/line/vintage/ws-1100/` shipped on 2026-09-08 reading **"WS-1100 — 1
 * references"** — live, and in the prerendered `<title>` that Googlebot reads.
 * It was invisible for as long as it was because no series in the catalogue had
 * ever held exactly one reference, and `ws-1100` is one because the only other
 * reference in it has no archived page and cannot be written.
 *
 * A count concatenated onto a fixed noun is a plural bug waiting for its first
 * `1`, and this module composes every title on the site.
 */
import { describe, expect, it } from 'vitest'

import { editionTitle, lineTitle, qualifiedTitle, seriesTitle, siteTitle, watchTitle } from './titles.ts'

describe('seriesTitle', () => {
  it('says "1 reference" for a series holding one', () => {
    expect(seriesTitle('WS-1100', 1)).toBe('WS-1100 — 1 reference · Casio Vault')
  })

  it('says "references" for two and above', () => {
    expect(seriesTitle('W-735', 9)).toBe('W-735 — 9 references · Casio Vault')
    expect(seriesTitle('WS-1400', 7)).toContain('7 references')
  })

  it('says "references" for zero, because zero is plural in English', () => {
    // The condition is `=== 1` rather than `<= 1` for exactly this. A series
    // page is never built with zero today; the rule is still the rule.
    expect(seriesTitle('X', 0)).toContain('0 references')
  })
})

describe('editionTitle', () => {
  it('pluralises on the same rule', () => {
    expect(editionTitle('PAC-MAN Collaboration', 1)).toBe('PAC-MAN Collaboration — 1 Casio reference · Casio Vault')
    expect(editionTitle('PAC-MAN Collaboration', 3)).toContain('3 Casio references')
  })
})

describe('the shapes every other title is built from', () => {
  it('keeps the qualifier, which is the half that kept getting lost', () => {
    // D77 exists because the React route overwrote the prerendered title with
    // the breadcrumb label and Googlebot indexed the shorter one.
    expect(watchTitle('GA-2100-1A')).toBe('GA-2100-1A — specification · Casio Vault')
    expect(qualifiedTitle('A', 'B')).toBe('A — B · Casio Vault')
    expect(siteTitle('A')).toBe('A · Casio Vault')
    expect(lineTitle('G-SHOCK')).toContain('G-SHOCK — every reference in the catalogue')
  })
})
