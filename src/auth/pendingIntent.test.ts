import { describe, expect, it, vi } from 'vitest'
import {
  INTENT_KEY,
  INTENT_TTL_MS,
  clearPendingIntent,
  ensureReturnPath,
  isSafeReturnPath,
  readPendingIntent,
  safePathOr,
  takePendingIntent,
  writePendingIntent,
} from './pendingIntent.ts'

/**
 * §13.1 names four cases for this module — applied on return, expired after
 * thirty minutes, discarded when it will not parse, and never applied twice —
 * and every one of them fails silently in production. There is no error state
 * for "a guest's press was quietly dropped"; there is only a watch that did not
 * get marked and a user who assumes the site is broken.
 *
 * D31 puts this file behind a 90% floor for that reason. The tests below go
 * past the four, because the two extra ones found real behaviour worth pinning:
 * the slot must be **cleared** when it is rejected, not merely ignored, and
 * `ensureReturnPath` must not overwrite an intent that is already there.
 */

const NOW = 1_700_000_000_000

describe('the slot', () => {
  it('reads back what was written', () => {
    writePendingIntent(
      { kind: 'collection', modelId: 'ga-2100-1a1', status: 'owned', returnTo: '/watch/ga-2100-1a1' },
      NOW,
    )

    expect(readPendingIntent(NOW)).toEqual({
      kind: 'collection',
      modelId: 'ga-2100-1a1',
      status: 'owned',
      returnTo: '/watch/ga-2100-1a1',
      ts: NOW,
    })
  })

  it('is empty when nothing has been written', () => {
    expect(readPendingIntent(NOW)).toBeNull()
  })

  it('carries a missing-reference draft under the same key (FR-9.3)', () => {
    writePendingIntent(
      { kind: 'request', ref: 'DW-5600E-1V', link: 'https://example.com/x', returnTo: '/search' },
      NOW,
    )
    const intent = readPendingIntent(NOW)
    expect(intent?.kind).toBe('request')
    expect(intent).toMatchObject({ ref: 'DW-5600E-1V', returnTo: '/search' })
  })

  it('carries a bare return path when there was no action', () => {
    writePendingIntent({ kind: 'return', returnTo: '/collection' }, NOW)
    expect(readPendingIntent(NOW)).toMatchObject({ kind: 'return', returnTo: '/collection' })
  })
})

describe('expiry (§9.4 — thirty minutes)', () => {
  it('survives right up to the boundary', () => {
    writePendingIntent({ kind: 'return', returnTo: '/' }, NOW)
    expect(readPendingIntent(NOW + INTENT_TTL_MS)).not.toBeNull()
  })

  it('is gone one millisecond past it', () => {
    writePendingIntent({ kind: 'return', returnTo: '/' }, NOW)
    expect(readPendingIntent(NOW + INTENT_TTL_MS + 1)).toBeNull()
  })

  it('clears the key when it expires, rather than leaving it to expire again', () => {
    writePendingIntent({ kind: 'return', returnTo: '/' }, NOW)
    readPendingIntent(NOW + INTENT_TTL_MS + 1)
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull()
  })

  it('treats a stamp from the future as expired', () => {
    // A machine that resynced its clock, or a stamp from another tab. Not a
    // case to support — but "valid forever" is the wrong way to fail.
    writePendingIntent({ kind: 'return', returnTo: '/' }, NOW + 60_000)
    expect(readPendingIntent(NOW)).toBeNull()
  })
})

describe('what it refuses', () => {
  it('discards a value that is not JSON, and clears it', () => {
    sessionStorage.setItem(INTENT_KEY, 'not json {{{')
    expect(readPendingIntent(NOW)).toBeNull()
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull()
  })

  it('discards a payload with an unknown kind', () => {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify({ kind: 'delete-everything', ts: NOW }))
    expect(readPendingIntent(NOW)).toBeNull()
  })

  it('discards a model id that could never be stored (D2, §6.3)', () => {
    sessionStorage.setItem(
      INTENT_KEY,
      JSON.stringify({
        kind: 'collection',
        modelId: 'GA_2100; drop table',
        status: 'owned',
        returnTo: '/',
        ts: NOW,
      }),
    )
    expect(readPendingIntent(NOW)).toBeNull()
  })

  it('discards an unrecognised extra key rather than storing it', () => {
    sessionStorage.setItem(
      INTENT_KEY,
      JSON.stringify({ kind: 'return', returnTo: '/', ts: NOW, admin: true }),
    )
    expect(readPendingIntent(NOW)).toBeNull()
  })

  it.each([
    ['//evil.example', 'protocol-relative — another origin that starts with a slash'],
    ['https://evil.example', 'absolute'],
    ['/\\evil.example', 'backslash, which several browsers normalise to //'],
    ['watch/ga-2100-1a1', 'relative, so it depends on where it is read'],
    ['', 'empty'],
  ])('refuses %s as a return path (%s)', (path) => {
    expect(isSafeReturnPath(path)).toBe(false)
    sessionStorage.setItem(INTENT_KEY, JSON.stringify({ kind: 'return', returnTo: path, ts: NOW }))
    expect(readPendingIntent(NOW)).toBeNull()
  })

  it('refuses an absurdly long path', () => {
    expect(isSafeReturnPath(`/${'a'.repeat(512)}`)).toBe(false)
  })

  it('accepts an ordinary path with a query string', () => {
    expect(isSafeReturnPath('/line/vintage?year=1992&sort=ref')).toBe(true)
  })
})

describe('consuming it', () => {
  it('is never applied twice', () => {
    writePendingIntent({ kind: 'return', returnTo: '/watch/f-91w-1' }, NOW)
    expect(takePendingIntent(NOW)).not.toBeNull()
    expect(takePendingIntent(NOW)).toBeNull()
  })

  it('clears the slot even when what it found had expired', () => {
    writePendingIntent({ kind: 'return', returnTo: '/' }, NOW)
    expect(takePendingIntent(NOW + INTENT_TTL_MS + 1)).toBeNull()
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull()
  })

  it('clears on demand', () => {
    writePendingIntent({ kind: 'return', returnTo: '/' }, NOW)
    clearPendingIntent()
    expect(readPendingIntent(NOW)).toBeNull()
  })
})

describe('ensureReturnPath', () => {
  it('writes a bare return path when the slot is empty', () => {
    ensureReturnPath('/line/vintage', NOW)
    expect(readPendingIntent(NOW)).toMatchObject({ kind: 'return', returnTo: '/line/vintage' })
  })

  /**
   * The ordering bug this exists to catch: a guest presses *Owned One*, which
   * writes a collection intent, and *then* the modal opens. If opening the
   * modal overwrote the slot, the press D6 promised to remember would be thrown
   * away by the dialogue that exists to remember it.
   */
  it('does not overwrite an action that is already waiting', () => {
    writePendingIntent(
      { kind: 'collection', modelId: 'f-91w-1', status: 'owned', returnTo: '/watch/f-91w-1' },
      NOW,
    )
    ensureReturnPath('/line/vintage', NOW)
    expect(readPendingIntent(NOW)).toMatchObject({ kind: 'collection', modelId: 'f-91w-1' })
  })

  it('replaces an expired action rather than inheriting its return path', () => {
    writePendingIntent(
      { kind: 'collection', modelId: 'f-91w-1', status: 'owned', returnTo: '/watch/f-91w-1' },
      NOW,
    )
    const later = NOW + INTENT_TTL_MS + 1
    ensureReturnPath('/line/vintage', later)
    expect(readPendingIntent(later)).toMatchObject({ kind: 'return', returnTo: '/line/vintage' })
  })

  it('falls back to / rather than storing a path it would refuse', () => {
    ensureReturnPath('//evil.example', NOW)
    expect(readPendingIntent(NOW)).toMatchObject({ returnTo: '/' })
    expect(safePathOr('//evil.example')).toBe('/')
    expect(safePathOr('/watch/f-91w-1')).toBe('/watch/f-91w-1')
  })
})

describe('when storage is unavailable', () => {
  it('reads as empty instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readPendingIntent(NOW)).toBeNull()
    vi.restoreAllMocks()
  })

  it('loses the press instead of failing the sign-in', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => writePendingIntent({ kind: 'return', returnTo: '/' }, NOW)).not.toThrow()
    vi.restoreAllMocks()
  })

  it('does not throw when it cannot clear', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => clearPendingIntent()).not.toThrow()
    vi.restoreAllMocks()
  })
})
