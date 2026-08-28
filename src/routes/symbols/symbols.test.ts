import { describe, expect, it } from 'vitest'
import { DRAWN_ICONS } from './SymbolGlyph'
import { ALL_SYMBOLS, SOURCED_MODULES, SYMBOL_GROUPS, manualUrl } from './symbols.ts'
import { strings } from '../../i18n/strings'

/**
 * The glossary's integrity checks, in the spirit of §10.2's.
 *
 * The failure mode this file exists for is the same one the catalogue's checks
 * exist for, and it is quiet rather than loud: a symbol whose citation points at
 * a manual nobody read, a group heading that renders as its own key, an icon
 * name with no drawing behind it. None of those throws — they render, wrongly,
 * and look finished.
 */
describe('the display-symbol glossary', () => {
  it('gives every symbol a unique id', () => {
    const ids = ALL_SYMBOLS.map((symbol) => symbol.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /**
   * A token **or** a drawing, never both and never neither. Both is two answers
   * to "what does this look like" in one cell; neither is a row with an empty
   * chip where the whole point of the page should be.
   */
  it('gives every symbol exactly one of a token and an icon', () => {
    for (const symbol of ALL_SYMBOLS) {
      const has = [symbol.token, symbol.icon].filter(Boolean).length
      expect(has, `${symbol.id} has ${has} of token/icon`).toBe(1)
    }
  })

  it('has a drawing for every icon a symbol names', () => {
    for (const symbol of ALL_SYMBOLS) {
      if (symbol.icon) expect(DRAWN_ICONS, symbol.id).toContain(symbol.icon)
    }
  })

  /** The other direction: a drawing nothing uses is dead weight in the chunk. */
  it('uses every drawing it defines', () => {
    const used = new Set(ALL_SYMBOLS.map((symbol) => symbol.icon).filter(Boolean))
    for (const icon of DRAWN_ICONS) expect([...used], icon).toContain(icon)
  })

  /**
   * **The check that matters most.** Every citation has to name a manual that is
   * on the sourced list — the twenty Operation Guides this catalogue already
   * cites. A module number invented at the keyboard would build a plausible
   * casio.com URL and 404 silently, which is exactly the shape of claim §10.6
   * refuses: one nobody can check.
   */
  it('cites only manuals on the sourced list', () => {
    for (const symbol of ALL_SYMBOLS) {
      expect(symbol.modules.length, `${symbol.id} cites nothing`).toBeGreaterThan(0)
      for (const module of symbol.modules) {
        expect(SOURCED_MODULES as readonly string[], `${symbol.id} cites ${module}`).toContain(
          module,
        )
      }
    }
  })

  it('cites each manual at most once per symbol', () => {
    for (const symbol of ALL_SYMBOLS) {
      expect(new Set(symbol.modules).size, symbol.id).toBe(symbol.modules.length)
    }
  })

  /**
   * The URL Casio actually files a guide under: the folder is the first two
   * digits of the module number, and getting that wrong points every citation
   * on the page at somebody else's watch.
   */
  it('builds a manual URL under the first two digits of the module', () => {
    expect(manualUrl('3266')).toBe(
      'https://www.casio.com/content/dam/casio/global/support/manuals/watches/pdf/32/3266/qw3266_EN.pdf',
    )
    expect(manualUrl('5611')).toBe(
      'https://www.casio.com/content/dam/casio/global/support/manuals/watches/pdf/56/5611/qw5611_EN.pdf',
    )
  })

  /**
   * D12 for the half of this page that does go through `t()`. A group added
   * without its heading renders the key itself — visible, ugly, and the sort of
   * thing that ships because nobody scrolled that far.
   */
  it('has a heading string for every group', () => {
    for (const group of SYMBOL_GROUPS) {
      expect(strings, group.id).toHaveProperty(`symbols.group.${group.id}`)
    }
  })

  it('puts at least one symbol in every published group', () => {
    for (const group of SYMBOL_GROUPS) {
      expect(group.symbols.length, group.id).toBeGreaterThan(0)
    }
  })

  /** Prose that trails off mid-sentence is the usual sign of a paste that lost
      its tail. Cheap to check, and it has caught one already. */
  it('ends every sentence it starts', () => {
    for (const symbol of ALL_SYMBOLS) {
      expect(symbol.meaning.trim(), symbol.id).toMatch(/[.!?]$/)
      if (symbol.detail) expect(symbol.detail.trim(), symbol.id).toMatch(/[.!?]$/)
    }
  })
})
