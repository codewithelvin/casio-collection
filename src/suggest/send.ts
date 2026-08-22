import { supabaseConfig } from '../auth/config.ts'
import type { Suggestion } from './suggestion.ts'

/**
 * Post a suggestion to the Edge Function that holds the SMTP credentials.
 *
 * **A plain `fetch` and not the Supabase client, deliberately.** §12's rule is
 * that a guest never downloads the auth library, and the client's decision that
 * anyone may send a suggestion without signing in is exactly what makes that
 * affordable here: an unauthenticated POST needs no session, no token refresh
 * and no PostgREST, so it needs none of the 100-odd kilobytes that provide them.
 * `functions.invoke` would have pulled the whole module in behind a link on a
 * catalogue page.
 *
 * **The anon key is sent and it is not a secret** (D14, §14.2): it already ships
 * inside this bundle and any visitor can read it. It is here because Supabase's
 * gateway wants a key on the way to a function, not because it protects
 * anything — the function is deployed with `--no-verify-jwt` on purpose.
 *
 * The Supabase origin is already in the CSP's `connect-src` (S7, `vite.config.ts`),
 * because a function shares its project's origin. Nothing widens for this.
 */
export const FUNCTION_NAME = 'suggest-correction'

/** §14.2 — no project wired up, no endpoint. The button asks before it renders. */
export function isSuggestionConfigured(): boolean {
  return supabaseConfig() !== null
}

export async function sendSuggestion(suggestion: Suggestion): Promise<void> {
  const config = supabaseConfig()
  if (!config) {
    throw new Error('suggest: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set (§14.2)')
  }

  const response = await fetch(`${config.url}/functions/v1/${FUNCTION_NAME}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: config.anonKey,
      authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify(suggestion),
  })

  if (response.ok) return

  /**
   * The function answers 429 when the same address has sent several in an hour,
   * and that is a rule rather than a fault — the form says so in its own words
   * instead of showing the reader a failure they cannot act on. Everything else
   * is one message: a suggestion that did not send is worth retrying, and the
   * detail belongs in the console rather than in a modal.
   */
  const detail = await response.text().catch(() => '')
  throw new Error(`suggest: HTTP ${response.status} ${detail.slice(0, 200)}`)
}
