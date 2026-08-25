/**
 * §9.1 — the sign-in methods are **configuration, not branching code**.
 *
 * D20 is explicit that turning magic link on must be one constant plus a
 * Supabase dashboard toggle, never a refactor, "because a flag that touches
 * five files is a flag nobody dares flip". So there is exactly one list, it is
 * read in exactly one place (the sign-in modal), and the email flow underneath
 * it is built and tested rather than stubbed.
 */
export type AuthMethod = 'google' | 'email'

/**
 * The launch set (D20). Adding `'email'` here plus enabling the provider in
 * Supabase is the whole of switching magic link on — and §9.2 lists the four
 * remaining conditions that have to be true before it is honest to do so.
 *
 * Typed as `readonly AuthMethod[]` rather than `as const` deliberately: a
 * narrowed tuple would make every email branch statically dead, and the point
 * of D20 is that those branches are live code with tests, waiting on a flag.
 */
export const AUTH_METHODS: readonly AuthMethod[] = ['google']

/**
 * The localStorage key Supabase persists the session under.
 *
 * **We name it rather than letting the library derive it from the project ref.**
 * That is what makes §12's rule affordable: the shell can ask "is anyone signed
 * in here?" with a single string read and no import, and only pay for the auth
 * library when the answer is yes. A key of the form `sb-<ref>-auth-token` would
 * mean knowing the project ref to ask the question, and the project ref lives in
 * the config we were trying not to load.
 */
export const SESSION_STORAGE_KEY = 'cc.session'

export interface SupabaseConfig {
  url: string
  anonKey: string
}

/**
 * §14.2 — both values are repository *variables*, not secrets. D14 says so
 * plainly: the anon key ships inside a static bundle any visitor can read, and
 * treating it as a secret only hides that from the next maintainer.
 *
 * Returns `null` when either is absent, and that is a supported state rather
 * than an error. Until the Supabase project exists the site is exactly what it
 * was through M3 — a catalogue anyone can browse (D6) — and the account control
 * simply does not render. A **Sign in** button that opens nothing is worse than
 * no button, which is the same reason the header carried a comment instead of a
 * control from M0 until now.
 */
export function supabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (typeof url !== 'string' || typeof anonKey !== 'string') return null
  if (url.trim() === '' || anonKey.trim() === '') return null
  return { url: url.trim(), anonKey: anonKey.trim() }
}

/**
 * §9.1 / §9.3 — the OAuth return address, and it is built once here because it
 * has to match a string typed into two consoles **exactly**. A redirect URI is
 * compared for equality and never followed, so a trailing slash, a query string
 * or the wrong host all fail at the one moment the value is ever used.
 *
 * There is deliberately **no query string on it**. Where the user came from
 * travels in the pending-intent slot (§9.4) instead, which is what keeps this a
 * single fixed string the redirect allow-list can hold literally.
 */
export function authCallbackUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`
}

/**
 * **The net under the console setting above**, added 2026-08-25 after a real
 * sign-in failed in production.
 *
 * `redirectTo` is a *request*, not an instruction. Supabase compares it against
 * the project's Redirect URLs and, on no match, silently discards it and sends
 * the browser to the project's **Site URL** instead — with the authorisation
 * code still attached. The failure that prompted this landed a production
 * sign-in on `http://localhost:3000/?code=…`, which is GoTrue's *default* Site
 * URL: nothing in this repository has ever used port 3000, so that string could
 * only have come from a project whose URL configuration was never applied.
 * `supabase/README.md` documents the values; documenting is not applying.
 *
 * That particular case is unreachable from here — the browser is sent to
 * another origin and this code never runs. What is reachable, and is the next
 * rung of the same ladder, is a Site URL that is correct while the callback
 * entry is missing or mistyped: the visitor lands on **our** root carrying
 * `?code=…`, the router renders the front door, the code is dropped unread, and
 * the site shows them a *Sign in* button as though nothing had happened. A
 * silent signed-out state is the worst possible report of a configuration
 * error, because it looks exactly like a person who never pressed the button.
 *
 * So a code that arrives at the root is forwarded — **not consumed**. §9.2 gives
 * the exchange to `/auth/callback` and to nothing else, and this changes only
 * which URL the router boots on, before it reads one. `detectSessionInUrl` stays
 * off and the exchange stays in one testable place.
 *
 * Deliberately narrow in three ways:
 *
 *   * **The root only.** The Site-URL fallback always lands there, so matching
 *     any deeper path would buy nothing and would put this in the way of any
 *     future route that wants a `code` of its own.
 *   * **`replaceState`, not an assignment.** No reload, no second entry in the
 *     history stack, and the spent URL is gone from the back button.
 *   * **A provider refusal counts too.** Someone who presses *Cancel* returns
 *     with `error=access_denied` and no code; forwarding that reaches the
 *     callback's own failure screen instead of a front door that says nothing.
 */
export function forwardOAuthReturnAtRoot(): void {
  const base = import.meta.env.BASE_URL
  const { pathname, search } = window.location
  if (pathname !== base) return

  const params = new URLSearchParams(search)
  if (!params.has('code') && !params.has('error') && !params.has('error_description')) return

  window.history.replaceState(null, '', `${base}auth/callback${search}`)
}
