import { describe, expect, it } from 'vitest'
import { buildSearchIndex, normalise, queryTerms, searchCatalog } from './search.ts'
import { catalogFixture } from '../test/catalogFixture'
import type { FullCatalog } from './schema.ts'

const index = buildSearchIndex(catalogFixture)
const refs = (query: string, limit?: number) =>
  searchCatalog(index, query, limit).map((model) => model.ref)

describe('normalisation (FR-2.2)', () => {
  it('reduces every punctuation form of a reference to the same string', () => {
    // The four forms §13.1 names, plus the one nobody writes down: a reference
    // pasted out of a listing with a trailing full stop.
    expect(normalise('ga2100')).toBe('ga2100')
    expect(normalise('GA-2100')).toBe('ga2100')
    expect(normalise('ga 2100')).toBe('ga2100')
    expect(normalise('Ga2100')).toBe('ga2100')
    expect(normalise('GA-2100.')).toBe('ga2100')
  })

  it('drops a query that is only punctuation, rather than making it match everything', () => {
    expect(queryTerms('  -  ')).toEqual([])
    expect(queryTerms('f-91w  blue')).toEqual(['f91w', 'blue'])
  })
})

describe('matching a reference', () => {
  it('finds GA-2100-1A1 from all four ways a person types it (FR-2.2)', () => {
    for (const query of ['ga2100', 'GA-2100', 'ga 2100', 'Ga2100']) {
      expect(refs(query)).toContain('GA-2100-1A1')
    }
  })

  it('returns nothing for a query that matches nothing, and does not throw', () => {
    expect(refs('rolex submariner')).toEqual([])
  })

  it('returns nothing for an empty query rather than the whole catalogue', () => {
    // The grid already shows everything; a search field that answers "" with the
    // catalogue reads as broken.
    expect(refs('')).toEqual([])
    expect(refs('   ')).toEqual([])
  })
})

describe('matching the other five fields (FR-2.1)', () => {
  it('finds three separate series from one family word (D32)', () => {
    // The whole argument for D32's display layer: "square" is not a series, not
    // a URL and not in any reference code, and it is what a collector says.
    const found = refs('square')
    expect(found).toContain('DW-5600E-1V')
    expect(found).toContain('GW-M5610U-1')
    // …and not the octagonal one, which is the half that proves it is matching
    // the family rather than everything.
    expect(found).not.toContain('GA-2100-1A1')
  })

  it('finds a watch by its marketing name', () => {
    expect(refs('casioak')).toEqual(['GA-2100-1A1'])
  })

  it('finds a watch by its module number', () => {
    expect(refs('3229')).toEqual(['DW-5600E-1V'])
  })

  it('finds a series by the alias collectors actually type', () => {
    // `aka: [F91W]` on the series, which is the only reason this differs from
    // the reference match — F91W normalises to the same string as F-91W.
    expect(refs('f91w')).toEqual(['F-91W-1', 'F-91W-3'])
  })

  it('finds every model in a line by the line name', () => {
    expect(refs('vintage')).toEqual(['F-91W-1', 'F-91W-3'])
  })

  it('narrows rather than widens as terms are added', () => {
    expect(refs('f91w')).toHaveLength(2)
    expect(refs('f91w 593')).toEqual(['F-91W-1'])
  })

  it('finds an edition by name, across the lines its references sit in (D62)', () => {
    // The strongest case for indexing a grouping: nobody looks up GA-2100-1A1,
    // they look up the Pac-Man one — and the two answers are in different lines.
    const found = refs('pac man')
    expect(found).toEqual(['F-91W-1', 'GA-2100-1A1'])
  })

  it('finds an edition by the alias a keyboard can actually type', () => {
    // `aka: [PACMAN]` on the edition. The name normalises to `pacmancollaboration`,
    // so `pacman` matches it as a substring either way — but an accented name
    // like *Café Kitsuné* does not survive normalisation, and the alias is the
    // whole mechanism that makes those reachable.
    expect(refs('pacman')).toEqual(['F-91W-1', 'GA-2100-1A1'])
  })

  it('finds an edition by its partner', () => {
    expect(refs('mattel')).toEqual(['GW-M5610U-1'])
  })

  it('leaves a watch in no edition out of an edition search', () => {
    expect(refs('pacman')).not.toContain('DW-5600E-1V')
  })
})

describe('ranking (FR-2.3 shows eight of these)', () => {
  it('puts an exact reference first, ahead of everything that merely contains it', () => {
    const catalog: FullCatalog = {
      ...catalogFixture,
      models: [
        ...catalogFixture.models,
        {
          id: 'ga-2100-1a1-x',
          ref: 'GA-2100-1A1X',
          line: 'g-shock',
          series: 'ga-2100',
          source: { url: 'https://example.com/x', kind: 'community' },
        },
      ],
    }
    const ranked = searchCatalog(buildSearchIndex(catalog), 'ga-2100-1a1').map((m) => m.ref)
    expect(ranked[0]).toBe('GA-2100-1A1')
  })

  it('puts a reference match above a watch that merely has that module number', () => {
    // Type 593 and you mean the reference W-593-1, not the F-91W whose module
    // happens to be 593. Both are honest matches; only one is what was typed.
    const catalog: FullCatalog = {
      ...catalogFixture,
      models: [
        ...catalogFixture.models,
        {
          id: 'w-593-1',
          ref: 'W-593-1',
          line: 'vintage',
          series: 'f-91w',
          source: { url: 'https://example.com/w-593-1', kind: 'community' },
          // Search reads the browsable set, which withholds a model with no
          // photograph — without this the reference being ranked first is not
          // in the index at all, and the test passes its own point by omission.
          image: 'w-593-1',
        },
      ],
    }
    const ranked = searchCatalog(buildSearchIndex(catalog), '593').map((m) => m.ref)
    expect(ranked).toEqual(['W-593-1', 'F-91W-1'])
  })

  it('honours the dropdown cap and leaves the results page uncapped (FR-2.3)', () => {
    expect(refs('casio', 1)).toHaveLength(1)
    expect(refs('casio').length).toBeGreaterThan(1)
  })
})

describe('what search refuses to show', () => {
  it('never returns a tombstoned entry (D2, §6.2)', () => {
    const catalog: FullCatalog = {
      ...catalogFixture,
      models: [
        ...catalogFixture.models,
        {
          id: 'f-91w-1-dupe',
          ref: 'F-91W-1',
          line: 'vintage',
          series: 'f-91w',
          source: { url: 'https://example.com/dupe', kind: 'community' },
          tombstone: { reason: 'duplicate of f-91w-1', replaced_by: 'f-91w-1' },
        },
      ],
    }
    // The reference still answers — through the entry that replaced it, which is
    // the whole point of a tombstone rather than a deletion.
    const found = searchCatalog(buildSearchIndex(catalog), 'f-91w-1')
    expect(found.map((model) => model.id)).toEqual(['f-91w-1'])
  })

  it('does not match across a field boundary', () => {
    // "F-91W" followed by "Vintage" must not answer to "wvintage". The join
    // character is the only thing preventing it, and nothing else would notice.
    expect(refs('wvintage')).toEqual([])
  })
})
