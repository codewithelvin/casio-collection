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
