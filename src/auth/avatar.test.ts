import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AVATAR_STORAGE_KEY, clearCachedAvatar, readCachedAvatar, refreshAvatar } from './avatar.ts'

/**
 * S7 / S8 — the profile picture, and the rule that makes it allowed to exist.
 *
 * The property under test throughout is that **nothing here can put a URL on
 * the page.** A `data:image/...` is renderable under `img-src 'self' data:`
 * without widening anything; anything else is a third-party request S8 forbids,
 * or in the `data:text/html` case a stored-XSS sink. So the validator is the
 * subject of most of this file rather than the fetching.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

function invoker(result: { data?: unknown; error?: unknown }) {
  const invoke = vi.fn(async () => result)
  return { client: { functions: { invoke } } as unknown as SupabaseClient, invoke }
}

beforeEach(() => {
  localStorage.clear()
})

describe('readCachedAvatar', () => {
  it('returns a cached PNG or JPEG data URI', () => {
    localStorage.setItem(AVATAR_STORAGE_KEY, PNG)
    expect(readCachedAvatar()).toBe(PNG)
    localStorage.setItem(AVATAR_STORAGE_KEY, JPEG)
    expect(readCachedAvatar()).toBe(JPEG)
  })

  it('is null when nothing is cached', () => {
    expect(readCachedAvatar()).toBeNull()
  })

  /**
   * The one that matters. A value read from localStorage and handed to `src` is
   * the shape of a stored-XSS sink, so the reader validates rather than trusts —
   * localStorage is a place other software on the same origin can write.
   */
  it.each([
    ['a remote URL, which S8 forbids', 'https://lh3.googleusercontent.com/a/whatever'],
    ['an http URL', 'http://example.com/a.png'],
    ['a protocol-relative URL', '//lh3.googleusercontent.com/a/whatever'],
    ['data:text/html, which is a script sink', 'data:text/html;base64,PHNjcmlwdD4='],
    ['data:image/svg+xml, which can carry script', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data URI that is not base64', 'data:image/png,notbase64'],
    ['rubbish', 'nonsense'],
    ['empty', ''],
  ])('refuses %s and drops it from storage', (_why, value) => {
    localStorage.setItem(AVATAR_STORAGE_KEY, value)
    expect(readCachedAvatar()).toBeNull()
    // Not merely ignored — removed, so a bad value cannot sit there being
    // re-evaluated by every future reader.
    expect(localStorage.getItem(AVATAR_STORAGE_KEY)).toBeNull()
  })

  it('refuses an implausibly large value without trying to render it', () => {
    localStorage.setItem(AVATAR_STORAGE_KEY, `data:image/png;base64,${'A'.repeat(60_000)}`)
    expect(readCachedAvatar()).toBeNull()
  })

  it('survives storage throwing, because a picture must not cost the page', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    expect(readCachedAvatar()).toBeNull()
    getItem.mockRestore()
  })
})

describe('clearCachedAvatar (FR-11.6)', () => {
  it('removes the cached picture, so a shared device does not keep a face', () => {
    localStorage.setItem(AVATAR_STORAGE_KEY, PNG)
    clearCachedAvatar()
    expect(localStorage.getItem(AVATAR_STORAGE_KEY)).toBeNull()
  })

  it('does not throw when storage refuses', () => {
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    expect(() => clearCachedAvatar()).not.toThrow()
    removeItem.mockRestore()
  })
})

describe('refreshAvatar', () => {
  it('caches and returns what the function gives back', async () => {
    const { client, invoke } = invoker({ data: { avatar: PNG }, error: null })
    await expect(refreshAvatar(client)).resolves.toBe(PNG)
    expect(invoke).toHaveBeenCalledWith('avatar', { method: 'POST' })
    expect(localStorage.getItem(AVATAR_STORAGE_KEY)).toBe(PNG)
  })

  /**
   * A 204 — the account has no picture — arrives as no error and no body. The
   * cache is cleared rather than left alone: somebody who removes their photo at
   * Google should stop seeing it here.
   */
  it('clears the cache when the account has no picture', async () => {
    localStorage.setItem(AVATAR_STORAGE_KEY, PNG)
    const { client } = invoker({ data: null, error: null })
    await expect(refreshAvatar(client)).resolves.toBeNull()
    expect(localStorage.getItem(AVATAR_STORAGE_KEY)).toBeNull()
  })

  it('refuses a URL even when the function returns one', async () => {
    const { client } = invoker({ data: { avatar: 'https://lh3.googleusercontent.com/a/x' }, error: null })
    await expect(refreshAvatar(client)).resolves.toBeNull()
    expect(localStorage.getItem(AVATAR_STORAGE_KEY)).toBeNull()
  })

  /**
   * The function is not deployed, or the network failed. This runs inside the
   * auth callback — the one interaction that must not fail — so every one of
   * these is null and none of them throws.
   */
  it('is null when the function errors, and leaves an existing cache alone', async () => {
    localStorage.setItem(AVATAR_STORAGE_KEY, PNG)
    const { client } = invoker({ data: null, error: new Error('not deployed') })
    await expect(refreshAvatar(client)).resolves.toBeNull()
    expect(localStorage.getItem(AVATAR_STORAGE_KEY)).toBe(PNG)
  })

  it('does not throw when invoke itself rejects', async () => {
    const client = {
      functions: {
        invoke: vi.fn(async () => {
          throw new Error('offline')
        }),
      },
    } as unknown as SupabaseClient
    await expect(refreshAvatar(client)).resolves.toBeNull()
  })

  it('still returns the picture when storage refuses to keep it', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { client } = invoker({ data: { avatar: JPEG }, error: null })
    await expect(refreshAvatar(client)).resolves.toBe(JPEG)
    setItem.mockRestore()
  })
})
