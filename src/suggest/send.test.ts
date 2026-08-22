import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FUNCTION_NAME, isSuggestionConfigured, sendSuggestion } from './send.ts'
import type { Suggestion } from './suggestion.ts'

const suggestion: Suggestion = {
  ref: 'DW-5600E-1V',
  modelId: 'dw-5600e-1v',
  line: 'g-shock',
  series: 'dw-5600',
  url: 'https://casiovault.com/watch/dw-5600e-1v',
  changes: [{ key: 'module', label: 'Module', from: '', to: '3229' }],
  note: '',
  link: '',
  email: '',
}

describe('sending a suggestion', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  })

  it('says nothing is configured until the project variables are set (§14.2)', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    expect(isSuggestionConfigured()).toBe(false)
  })

  it('posts the suggestion to the function, with the reference in it', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }))
    vi.stubGlobal('fetch', fetchMock)

    await sendSuggestion(suggestion)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://ref.supabase.co/functions/v1/${FUNCTION_NAME}`)
    expect(init.method).toBe('POST')
    // The anon key is not a secret (D14) and the gateway wants one on the way
    // through; the function itself verifies no JWT, by decision.
    expect(init.headers).toMatchObject({ apikey: 'anon-key' })
    expect(JSON.parse(String(init.body))).toMatchObject({
      ref: 'DW-5600E-1V',
      modelId: 'dw-5600e-1v',
    })
  })

  it('carries the status through, so the form can tell a rate limit from a fault', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, text: async () => 'too many' })),
    )

    await expect(sendSuggestion(suggestion)).rejects.toThrow(/HTTP 429/)
  })

  it('refuses rather than posting into the void with no project configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendSuggestion(suggestion)).rejects.toThrow(/14.2/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
