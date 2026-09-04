import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_STORAGE_KEY,
  analyticsAllowed,
  clearConsent,
  readConsent,
  writeConsent,
} from './consent'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('readConsent', () => {
  it('is unasked when nothing is stored', () => {
    expect(readConsent()).toBeNull()
  })

  it('reads back what was written', () => {
    writeConsent('granted')
    expect(readConsent()).toBe('granted')
    writeConsent('denied')
    expect(readConsent()).toBe('denied')
  })

  /**
   * The direction this must fail in. A value nobody recognises is somebody
   * else's key, a corrupted store or a half-finished migration — none of which
   * is a person agreeing to anything.
   */
  it('treats an unrecognised value as unasked, never as consent', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'true')
    expect(readConsent()).toBeNull()
    expect(analyticsAllowed()).toBe(false)

    localStorage.setItem(CONSENT_STORAGE_KEY, 'GRANTED')
    expect(readConsent()).toBeNull()
    expect(analyticsAllowed()).toBe(false)
  })

  it('is unasked when storage throws, rather than assuming either answer', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(readConsent()).toBeNull()
    expect(analyticsAllowed()).toBe(false)
  })
})

describe('writeConsent', () => {
  it('reports whether the choice could be remembered', () => {
    expect(writeConsent('granted')).toBe(true)
  })

  it('says so when it cannot store, rather than throwing at the caller', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(writeConsent('granted')).toBe(false)
  })
})

describe('clearConsent', () => {
  it('returns the reader to unasked', () => {
    writeConsent('denied')
    clearConsent()
    expect(readConsent()).toBeNull()
  })
})

describe('analyticsAllowed', () => {
  /** The single line the whole gate rests on, tested in both directions. */
  it('is true only for an explicit grant', () => {
    expect(analyticsAllowed()).toBe(false)

    writeConsent('denied')
    expect(analyticsAllowed()).toBe(false)

    writeConsent('granted')
    expect(analyticsAllowed()).toBe(true)

    clearConsent()
    expect(analyticsAllowed()).toBe(false)
  })
})
