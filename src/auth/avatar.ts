import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * §9 / S7 / S8 — the signed-in user's own profile picture, and the one route by
 * which one is ever allowed onto a page here.
 *
 * **The browser never contacts Google.** `session.ts` still refuses to keep the
 * `avatar_url` it is handed, for the reason it always did: S7's `img-src 'self'
 * data:` cannot render a third-party host, and S8 objects more fundamentally —
 * an `<img>` pointing at `lh3.googleusercontent.com` is a request to Google on
 * every page a signed-in user loads. That has not been relaxed and this does not
 * relax it.
 *
 * What changed on 2026-08-25 is where the fetching happens. The `avatar` Edge
 * Function reads the caller's own `avatar_url` from auth metadata, fetches the
 * bytes server-side, and returns a `data:` URI — which `img-src 'self' data:`
 * already permits, and which names no external host. **No CSP change was needed
 * for this feature**, and that is the property to keep.
 *
 * ONE REQUEST PER SIGN-IN, NOT PER PAGE. The result is cached in localStorage
 * beside the session, so the shell can put a face in the header on a cold load
 * with a single string read and no import and no network — the same trick §12
 * already plays with `cc.session`. A cache miss shows initials, which is the
 * state the header shipped with and is never wrong, only plainer.
 */
export const AVATAR_STORAGE_KEY = 'cc.avatar'

/**
 * Under 24 KB by construction — the function refuses to return more — but the
 * check is here too, because localStorage is a place other software writes.
 * A string this large is not something this app produced.
 */
const MAX_LENGTH = 48 * 1024

/**
 * S4 — what comes back out of storage is treated as untrusted input, because a
 * value read from localStorage and put straight into `src` is exactly the shape
 * of a stored-XSS sink. `data:image/...;base64,...` and nothing else: no
 * `data:text/html`, no `javascript:`, no remote URL.
 */
function isPublishableDataUri(value: string): boolean {
  if (value.length > MAX_LENGTH) return false
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
}

/**
 * The header's read. Deliberately synchronous, dependency-free and
 * exception-proof: it runs during the shell's first render, where throwing would
 * cost the whole page for the sake of a picture.
 */
export function readCachedAvatar(): string | null {
  try {
    const held = localStorage.getItem(AVATAR_STORAGE_KEY)
    if (held === null) return null
    if (!isPublishableDataUri(held)) {
      localStorage.removeItem(AVATAR_STORAGE_KEY)
      return null
    }
    return held
  } catch {
    // Storage disabled, or a private mode that throws on read. Nothing can have
    // been cached, so there is no picture — which is a fine state to be in.
    return null
  }
}

/** FR-11.6 — a shared device must not keep the last person's face in the header. */
export function clearCachedAvatar(): void {
  try {
    localStorage.removeItem(AVATAR_STORAGE_KEY)
  } catch {
    // Nothing to do and nothing to report: if storage refuses to be written,
    // nothing was written to it in the first place.
  }
}

/**
 * Ask the Edge Function once, after a sign-in, and cache what it gives back.
 *
 * **Never throws, and returns `null` for every kind of no.** The caller is the
 * auth callback, which is in the middle of the one interaction that must not
 * fail — turning a successful sign-in into an error page because a decoration
 * could not be fetched would be a poor trade. A 204 (no picture on the account),
 * a function that is not deployed, a network failure and a malformed answer are
 * all the same fact here: show initials.
 */
export async function refreshAvatar(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{ avatar?: unknown }>('avatar', {
      method: 'POST',
    })
    // A 204 arrives as no error and no body. That is the account genuinely
    // having no picture, so the cache is cleared rather than left stale — the
    // person may have removed it at Google.
    if (error) return null
    const value = data?.avatar
    if (typeof value !== 'string' || !isPublishableDataUri(value)) {
      clearCachedAvatar()
      return null
    }
    try {
      localStorage.setItem(AVATAR_STORAGE_KEY, value)
    } catch {
      // Quota or a disabled store. The picture is still returned and still
      // renders for this page load; it simply will not survive a reload.
    }
    return value
  } catch {
    return null
  }
}
