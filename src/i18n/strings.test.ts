import { describe, expect, it } from 'vitest'
import { strings, t } from './strings'

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
