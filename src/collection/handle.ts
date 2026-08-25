/**
 * FR-7.2 — **what may be claimed as a handle, decided in one pure function.**
 *
 * A handle becomes a public URL, `/u/<handle>`, so getting this wrong is not a
 * validation message — it is a route collision or a phishing surface that
 * outlives the mistake. D31 covers this folder for exactly that reason.
 *
 * The shape here is the same one §6.3's `handle_shape` check constraint
 * enforces in the database, deliberately written twice: this one is the
 * courtesy, that one is the rule. If they ever disagree the database wins and
 * the user sees a refusal they were told would not happen — which is why they
 * are kept side by side in the comment below rather than in two heads.
 *
 *   ^[a-z0-9][a-z0-9_-]{2,29}$
 */
export const HANDLE_MIN = 3
export const HANDLE_MAX = 30
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/

/**
 * FR-7.2's reserved list.
 *
 * The first group is every path segment this app routes on, because
 * `/u/collection` is not a collision but `casiovault.com/collection` versus a
 * user called *collection* is a confusion waiting to be exploited — and the
 * moment a future route is added, a handle already claimed under that name is
 * unrecoverable (D2's argument, applied to a name a person chose).
 *
 * The second group is the words that let somebody impersonate this site.
 * `admin` and `support` are what a phishing message says it is from.
 *
 * The line slugs arrive as a parameter rather than being copied here, because
 * a copy is a second list that stops agreeing the day a ninth line is added.
 */
export const RESERVED_HANDLES = [
  // Routes, present and plausible
  'about',
  'admin',
  'api',
  'auth',
  'collection',
  // D62 — both spellings. `/editions` is the route; `edition` is reserved
  // alongside it because the singular is the form somebody would guess, and a
  // handle that only collides with a plausible future URL is still a collision
  // waiting for the day somebody adds it.
  'edition',
  'editions',
  'help',
  'line',
  'login',
  'logout',
  'privacy',
  'search',
  'settings',
  'signin',
  'signup',
  'terms',
  'u',
  'watch',
  // Words that speak for the site
  'casio',
  'casiovault',
  'moderator',
  'official',
  'root',
  'staff',
  'support',
  'system',
  'vault',
] as const

export type HandleVerdict =
  | { ok: true }
  | { ok: false; reason: 'too-short' | 'too-long' | 'shape' | 'reserved' }

/**
 * Checked in this order on purpose: length first, because "3 to 30 characters"
 * is a fixable sentence, where a pattern failure on a two-character handle
 * would tell somebody their perfectly good name is malformed.
 */
export function validateHandle(raw: string, lineSlugs: readonly string[] = []): HandleVerdict {
  const handle = raw.trim().toLowerCase()

  if (handle.length < HANDLE_MIN) return { ok: false, reason: 'too-short' }
  if (handle.length > HANDLE_MAX) return { ok: false, reason: 'too-long' }
  if (!HANDLE_PATTERN.test(handle)) return { ok: false, reason: 'shape' }

  const reserved = new Set<string>([...RESERVED_HANDLES, ...lineSlugs])
  if (reserved.has(handle)) return { ok: false, reason: 'reserved' }

  return { ok: true }
}

/**
 * What gets stored and what gets looked up. Lowercased and trimmed, so
 * `Elvin ` and `elvin` are one handle rather than two rows that only the
 * case-insensitive unique index will ever notice are the same.
 */
export function normaliseHandle(raw: string): string {
  return raw.trim().toLowerCase()
}

/** FR-7.3 — the URL a published profile is reachable at, shown before it is on. */
export function profileUrl(origin: string, handle: string): string {
  return `${origin}/u/${normaliseHandle(handle)}`
}
