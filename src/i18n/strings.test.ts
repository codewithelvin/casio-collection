import { describe, expect, it } from 'vitest'
import { availabilityLabel, facetLabel, facetValueLabel, strings, t } from './strings'

describe('the strings module (D12)', () => {
  it('returns the English string for a key', () => {
    expect(t('footer.madeBy')).toBe('Made by Claude for Casio Lovers')
  })

  it('has no empty string, so a key never renders as a blank', () => {
    for (const [key, value] of Object.entries(strings)) {
      expect(value.trim(), `${key} is empty`).not.toBe('')
    }
  })

  it('never uses the word "official" (§8.11)', () => {
    // The site must not speak on Casio's behalf, and this is the word that does
    // it. Checking every string is cheap; noticing it in review is not.
    for (const [key, value] of Object.entries(strings)) {
      expect(value.toLowerCase(), `${key} claims to be official`).not.toContain('official')
    }
  })

  it('carries the non-affiliation sentence in full (D11, FR-10.3)', () => {
    expect(t('footer.disclaimer')).toContain('not affiliated with or endorsed by')
    expect(t('footer.disclaimer')).toContain('Casio Computer Co., Ltd.')
  })
})

describe('availability, in words (D59)', () => {
  it('never shows the reader the boolean it filters on', () => {
    // `discontinued` is the one facet whose values are not vocabulary, and a
    // filter option reading "true" beside a count is the failure this exists to
    // prevent — the URL carries the boolean, the page carries the sentence.
    expect(facetValueLabel('discontinued', 'true')).toBe('No longer listed by Casio')
    expect(facetValueLabel('discontinued', 'false')).toBe('Currently listed by Casio')
    expect(availabilityLabel(true)).toBe(facetValueLabel('discontinued', 'true'))
    expect(availabilityLabel(false)).toBe(facetValueLabel('discontinued', 'false'))
  })

  it('both labels say what was measured, which is what Casio lists', () => {
    // The measurement is Casio's sitemap across three locales — not production
    // status, which nobody publishes. Naming Casio in both directions is what
    // keeps the pill from overstating it into "discontinued" flat (FR-10.4).
    for (const value of ['true', 'false']) {
      expect(facetValueLabel('discontinued', value)).toContain('Casio')
      expect(facetValueLabel('discontinued', value)).toContain('listed')
    }
  })

  it('names the control for the question and not for one of its answers', () => {
    // A facet button labelled "Discontinued" reads as a checkbox for that value,
    // and the reader who wants the other half does not press it.
    expect(facetLabel('discontinued')).toBe('Availability')
  })
})
