// avatar — fetch the signed-in user's Google profile picture **server-side**,
// and hand the browser a `data:` URI it is already allowed to render.
//
// WHY THIS EXISTS AT ALL, WHICH IS THE WHOLE DESIGN.
//
// Google returns an `avatar_url` on `lh3.googleusercontent.com`. S7's CSP is
// `img-src 'self' data:` and S8 forbids third-party assets outright, so that URL
// can be neither rendered nor fetched by the browser — and the reason is not
// pedantry: an `<img>` pointing at Google is a request to Google on **every page
// a signed-in user loads**, which is exactly the tracking S8 exists to prevent.
//
// So the fetch happens here instead. The browser asks this function once per
// sign-in, over the Supabase origin `connect-src` already allows, and gets back
// a small `data:` URI. Nothing in the page ever names a Google host.
//
// **No CSP change was needed for this feature.** That is the property to
// preserve if anyone rewrites it: the moment the picture is served from a URL
// instead of a data URI, `img-src` has to be widened and S8's argument has to be
// reopened. Both alternatives were considered on 2026-08-25 and this is the one
// that costs no security policy:
//
//   * widen `img-src` to lh3.googleusercontent.com — one line, and it reverses
//     S8 for every page view of every signed-in user;
//   * fetch it in the browser and downscale on a canvas — needs `connect-src`
//     widened instead, and still puts the user in front of Google once a session.
//
// NOTHING IS STORED SERVER-SIDE. The data URI is returned, not written to
// `profiles`. That keeps a new column, a new RLS question and a new class of
// personal data at rest out of the system entirely — the browser caches it
// under its own key and drops it on sign-out (FR-11.6). The cost is that a
// public profile page shows initials to visitors rather than a photograph,
// which is a product decision nobody has made and this function does not make.
//
// NO SERVICE-ROLE KEY, and none is needed: everything below acts as the caller,
// using the caller's own JWT. S2 stays true without anyone having to remember it.
//
// DEPLOYING IT
//
//   supabase functions deploy avatar
//
// **Without `--no-verify-jwt`**, unlike `suggest-correction`. This one answers
// only for a signed-in caller and reads that caller's identity from the platform
// rather than from anything in the request body.
//
// No imports, deliberately — see the sibling function's header for the day that
// rule was bought with.

/** Only ever this host. See `fetchGoogleAvatar` for why this is not paranoia. */
const ALLOWED_AVATAR_HOSTS = ['lh3.googleusercontent.com', 'lh4.googleusercontent.com', 'lh5.googleusercontent.com', 'lh6.googleusercontent.com']

/** Google renders on demand: `=s96-c` is a 96 px square, cropped. */
const REQUESTED_SIZE = 96

/**
 * A 96 px JPEG is 3–6 KB and a PNG maybe 12 KB. 24 KB is generous for both and
 * still small enough to sit in localStorage beside a session without anyone
 * thinking about quota. Anything larger is refused rather than truncated — half
 * a base64 string is a broken image, not a small one.
 */
const MAX_BYTES = 24 * 1024

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authorization = req.headers.get('authorization')
  if (!authorization) return json({ error: 'unauthenticated' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    console.error('avatar: SUPABASE_URL or SUPABASE_ANON_KEY missing from the environment')
    return json({ error: 'not configured' }, 503)
  }

  // The avatar URL is read from the PLATFORM, never from the request body. A
  // client that could name the URL to fetch would have turned this function
  // into an SSRF proxy pointed at whatever it liked, authenticated as us.
  let avatarUrl: string | null
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { authorization, apikey: anonKey },
    })
    if (!res.ok) return json({ error: 'unauthenticated' }, 401)
    const user = await res.json()
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
    const raw = metadata.avatar_url ?? metadata.picture
    avatarUrl = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
  } catch (error) {
    console.error('avatar: could not read the user', error)
    return json({ error: 'unavailable' }, 502)
  }

  // Not an error. Magic-link accounts have no picture, and neither do Google
  // accounts that never set one — 204 means "asked and answered, there is none",
  // which is what lets the browser stop asking.
  if (avatarUrl === null) return new Response(null, { status: 204, headers: CORS })

  const dataUri = await fetchGoogleAvatar(avatarUrl)
  if (dataUri === null) return new Response(null, { status: 204, headers: CORS })

  return json({ avatar: dataUri }, 200)
})

/**
 * Fetch, validate, and encode. Returns `null` for every kind of no — an
 * unexpected host, an unexpected type, too many bytes, a network failure. The
 * caller turns all of them into 204, because from the browser's point of view
 * they are the same fact: there is no picture to show.
 */
async function fetchGoogleAvatar(rawUrl: string): Promise<string | null> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  // **The allow-list is the guard, and it is not paranoia about Google.** This
  // string arrives from the identity provider through auth metadata, and
  // metadata is writable in more ways than one over a system's lifetime. A
  // function that fetches whatever it is handed, from inside the platform's
  // network, is an SSRF primitive; one that fetches only from four named hosts
  // over https is not.
  if (url.protocol !== 'https:' || !ALLOWED_AVATAR_HOSTS.includes(url.hostname)) {
    console.error(`avatar: refusing a non-Google avatar host: ${url.hostname}`)
    return null
  }

  // Google sizes on demand through a suffix on the last path segment —
  // `…/a/ACg8oc…=s96-c`. Asking for 96 px means there is no image processing to
  // do here at all, which matters: Deno has no `sharp`, and the alternative
  // would have been shipping a decoder into an edge worker.
  url.pathname = url.pathname.replace(/=s\d+(-c)?$/, '')
  const sized = `${url.origin}${url.pathname}=s${REQUESTED_SIZE}-c`

  let response: Response
  try {
    response = await fetch(sized, { signal: AbortSignal.timeout(5_000) })
  } catch (error) {
    console.error('avatar: fetch failed', error)
    return null
  }
  if (!response.ok) {
    console.error(`avatar: Google answered HTTP ${response.status}`)
    return null
  }

  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_TYPES.includes(type)) {
    console.error(`avatar: unexpected content-type ${type || '(none)'}`)
    return null
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    console.error(`avatar: ${bytes.byteLength} bytes is outside 1..${MAX_BYTES}`)
    return null
  }

  return `data:${type};base64,${base64(bytes)}`
}

/**
 * Chunked on purpose. `String.fromCharCode(...bytes)` spreads every byte as an
 * argument, and a 24 KB image is 24 000 arguments — which throws
 * `RangeError: Maximum call stack size exceeded` on a large enough picture and
 * on no other, so it would have failed for some users and not others.
 */
function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
}
