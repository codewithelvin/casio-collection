import { describe, expect, it } from 'vitest'
import { newest, parseGitLog } from './lastmod.ts'

const LOG = [
  '2026-09-01T10:00:00+04:00',
  'catalog-src/g-shock/dw-5600.yaml',
  'catalog-src/lines.yaml',
  '',
  '2026-08-20T09:00:00+04:00',
  'catalog-src/g-shock/dw-5600.yaml',
  'catalog-src/vintage/f-91w.yaml',
].join('\n')

describe('parseGitLog', () => {
  it('attributes each file to the commit that touched it', () => {
    const dates = parseGitLog(LOG)
    expect(dates.get('catalog-src/lines.yaml')).toBe('2026-09-01T10:00:00+04:00')
    expect(dates.get('catalog-src/vintage/f-91w.yaml')).toBe('2026-08-20T09:00:00+04:00')
  })

  /** The log arrives newest first, so a file touched twice keeps the first date. */
  it('keeps the newest date for a file that appears more than once', () => {
    expect(parseGitLog(LOG).get('catalog-src/g-shock/dw-5600.yaml')).toBe(
      '2026-09-01T10:00:00+04:00',
    )
  })

  it('reads a log with no blank line between commits, which is what %cI prints', () => {
    const dates = parseGitLog('2026-09-01T10:00:00+04:00\na.yaml\n2026-08-01T10:00:00+04:00\nb.yaml')
    expect(dates.get('a.yaml')).toBe('2026-09-01T10:00:00+04:00')
    expect(dates.get('b.yaml')).toBe('2026-08-01T10:00:00+04:00')
  })

  it('ignores a merge commit, which lists no files', () => {
    const dates = parseGitLog('2026-09-02T10:00:00+04:00\n\n2026-09-01T10:00:00+04:00\na.yaml')
    expect(dates.get('a.yaml')).toBe('2026-09-01T10:00:00+04:00')
    expect(dates.size).toBe(1)
  })

  it('returns nothing for empty output rather than throwing', () => {
    expect(parseGitLog('').size).toBe(0)
  })

  it('does not mistake a file named like a date for a date', () => {
    // The date test is anchored, so a path is a path.
    const dates = parseGitLog('2026-09-01T10:00:00+04:00\ncatalog-src/2026-09-01T10:00:00+04:00.yaml')
    expect(dates.size).toBe(1)
    expect([...dates.keys()][0]).toContain('.yaml')
  })
})

describe('newest', () => {
  it('takes the latest instant', () => {
    expect(newest(['2026-08-01T10:00:00+04:00', '2026-09-01T10:00:00+04:00'])).toBe(
      '2026-09-01T10:00:00+04:00',
    )
  })

  /**
   * The reason this compares instants and not strings. 09:00+04:00 is 05:00
   * UTC and 08:00+00:00 is 08:00 UTC, so the string that sorts higher is the
   * earlier moment — and the commits in this repository do come from more than
   * one offset.
   */
  it('compares across time zones rather than lexically', () => {
    expect(newest(['2026-09-01T09:00:00+04:00', '2026-09-01T08:00:00+00:00'])).toBe(
      '2026-09-01T08:00:00+00:00',
    )
  })

  it('skips the pages whose source has no date', () => {
    expect(newest([undefined, '2026-09-01T10:00:00+04:00', undefined])).toBe(
      '2026-09-01T10:00:00+04:00',
    )
  })

  it('is undefined when nothing is dated', () => {
    expect(newest([undefined, undefined])).toBeUndefined()
    expect(newest([])).toBeUndefined()
  })
})
