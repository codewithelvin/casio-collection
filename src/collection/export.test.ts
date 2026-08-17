import { describe, expect, it, vi } from 'vitest'
import { catalogFixture } from '../test/catalogFixture'
import { joinCollection } from './join.ts'
import { collectionStats, csvCell, downloadFile, toCsv, toJson, toRows } from './export.ts'
import type { CollectionItem } from './api.ts'

/**
 * FR-6.6 and FR-6.3. The export is the promise that makes asking somebody to
 * type their collection into this site a fair exchange, so the interesting
 * tests here are the ones about not losing a row and not corrupting a file.
 */

const item = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  model_id: 'ga-2100-1a1',
  status: 'owned',
  note: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

const join = (items: CollectionItem[]) => joinCollection(catalogFixture, items)

describe('what the export carries (FR-6.6)', () => {
  it('carries the reference, not only the id', () => {
    const [row] = toRows(join([item()]))

    // An id is meaningful only to this catalogue. A file nobody can read
    // without the site it came from is not really theirs.
    expect(row).toMatchObject({
      model_id: 'ga-2100-1a1',
      ref: 'GA-2100-1A1',
      line: 'g-shock',
      series: 'ga-2100',
      status: 'owned',
      added: '2026-01-01T00:00:00.000Z',
    })
  })

  /** FR-6.5 all the way out to the file: the row the catalogue lost is still theirs. */
  it('exports an unlisted row with the fields it cannot supply left empty', () => {
    const [row] = toRows(join([item({ model_id: 'withdrawn-reference' })]))

    expect(row).toMatchObject({ model_id: 'withdrawn-reference', ref: '', line: '', series: '' })
  })

  it('is valid JSON with every row present', () => {
    const parsed = JSON.parse(toJson(join([item(), item({ model_id: 'f-91w-1' })])))
    expect(parsed).toHaveLength(2)
  })
})

describe('the CSV', () => {
  it('quotes a note containing a comma', () => {
    const csv = toCsv(join([item({ note: 'Bought in Osaka, 2019' })]))
    expect(csv).toContain('"Bought in Osaka, 2019"')
  })

  /**
   * FR-5.3 keeps line breaks in notes, so a multi-line note is ordinary. Unquoted,
   * one watch becomes three broken rows in every spreadsheet that opens the file.
   */
  it('quotes a note containing newlines rather than splitting the row', () => {
    const csv = toCsv(join([item({ note: 'Line one\nLine two' })]))
    expect(csv).toContain('"Line one\nLine two"')
    // Header, one record — the record's own newline is inside the quotes.
    expect(csv.split('\r\n').filter(Boolean).length).toBe(2)
  })

  it('doubles a quote inside a note', () => {
    expect(csvCell('the "square"')).toBe('"the ""square"""')
  })

  /**
   * Not a CSV rule at all. A cell starting `=`, `+`, `-` or `@` is executed as a
   * formula by Excel and Sheets, so a note is a spreadsheet injection carried in
   * a file the user believes is their own data.
   */
  it('defuses a note that a spreadsheet would run as a formula', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('+cmd')).toBe("'+cmd")
    expect(csvCell('-2')).toBe("'-2")
  })

  it('leaves an ordinary cell alone', () => {
    expect(csvCell('GA-2100-1A1')).toBe('GA-2100-1A1')
  })

  it('starts with the header row', () => {
    expect(toCsv([]).split('\r\n')[0]).toBe('model_id,ref,line,series,status,note,added')
  })
})

describe('handing the file over', () => {
  /**
   * A blob URL rather than a `data:` URI, and it is **revoked**. An unrevoked
   * blob URL keeps its whole contents alive for the life of the document, which
   * for a collection of four hundred rows is a leak nobody would ever connect
   * to pressing Export twice.
   */
  it('creates a blob, clicks it, and revokes the URL', async () => {
    const created: Blob[] = []
    const revoked: string[] = []
    const clicked: string[] = []

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        created.push(blob)
        return 'blob:test'
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    })

    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.download)
      })

    downloadFile('casio-vault.csv', 'a,b\r\n', 'text/csv')

    expect(created).toHaveLength(1)
    expect(created[0]?.type).toBe('text/csv')
    expect(clicked).toEqual(['casio-vault.csv'])

    // Revocation is deferred a tick so the click is not racing it.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(revoked).toEqual(['blob:test'])

    // And the anchor does not stay in the document afterwards.
    expect(document.querySelector('a[download]')).toBeNull()

    click.mockRestore()
  })
})

describe('the summary strip (FR-6.3)', () => {
  it('counts each status and the lines represented', () => {
    const stats = collectionStats(
      join([
        item({ model_id: 'ga-2100-1a1', status: 'owned' }),
        item({ model_id: 'dw-5600e-1v', status: 'owned' }),
        item({ model_id: 'f-91w-1', status: 'wishlist' }),
      ]),
    )

    expect(stats.owned).toBe(2)
    expect(stats.wishlist).toBe(1)
    expect(stats.byLine).toEqual([
      { line: 'g-shock', count: 2 },
      { line: 'vintage', count: 1 },
    ])
  })

  /** Held order, not catalogue order — otherwise the line somebody collects is buried. */
  it('puts the most-held line first', () => {
    const stats = collectionStats(
      join([
        item({ model_id: 'f-91w-1' }),
        item({ model_id: 'f-91w-3' }),
        item({ model_id: 'ga-2100-1a1' }),
      ]),
    )

    expect(stats.byLine[0]).toEqual({ line: 'vintage', count: 2 })
  })

  it('counts an unlisted row in its status but under no line', () => {
    const stats = collectionStats(join([item({ model_id: 'gone', status: 'owned' })]))

    expect(stats.owned).toBe(1)
    expect(stats.unlisted).toBe(1)
    expect(stats.byLine).toEqual([])
  })
})
