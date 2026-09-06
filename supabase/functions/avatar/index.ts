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
// WHAT CHANGED ON 2026-09-06, AND WHY IT NEEDED A DECISION.
//
// This function used to end with: "nothing is stored server-side… the cost is
// that a public profile page shows initials to visitors rather than a
// photograph, which is a product decision nobody has made and this function does
// not make." **The client made it (D71): faces.** So there is now a second mode
// that writes the result to `profiles.avatar`, and one property of the original
// design is deliberately kept — it is still a `data:` URI, so `img-src 'self'
// data:` still covers it, no origin was added, and no browser here ever contacts
// Google. S8 is about who the browser talks to, not whose face is on the page.
//
// THE SERVICE-ROLE KEY IS USED FOR THAT WRITE, AND ONLY FOR THAT WRITE.
//
// This is the part to understand before changing anything. `profiles.avatar` is
// **not** in the client's update grant (0005), so `authenticated` cannot write
// it and neither can this function acting as the caller. That is not an oversight
// to work around — it is the entire defence. If the column were client-writable,
// a browser could PATCH any 12 KB image it liked into a field this site renders
// on a public page, and the site would be unmoderated image hosting arrived at
// by accident. The only bytes that can reach the column are bytes fetched below
// from one of four named Google hosts, with the content type and the length
// checked, for the user named by a **verified JWT** and never by a request body.
//
// S2 is amended to say the key exists in three places rather than two; the third
// is this runtime, where Supabase has been injecting it since the first deploy.
// `suggest-correction` and every future function must keep not using it, so that
// *the key is available here* never quietly becomes *functions may use the key*.
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
 * D71 — the stored copy has a tighter ceiling than the returned one, because
 * the directory renders twenty-four of them at once and 24 KB each is 576 KB of
 * base64 on a single screen. 12 288 characters is the same number the
 * `avatar_shape` check enforces in 0005; the two must not drift, and if they do
 * the database is the one that is right.
 */
const STORE_MAX_LENGTH = 12_288

/** The one fallback size, tried when 96 px lands over the storage ceiling. */
const FALLBACK_SIZE = 64

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

  // `store` is the only thing read from the body, and it is a tri-state: absent
  // means the original behaviour (fetch and return, store nothing), true means
  // also publish it, false means unpublish. Nothing else here is client-supplied
  // — see `fetchGoogleAvatar` for what that guards against.
  let store: boolean | undefined
  try {
    const body = req.headers.get('content-type')?.includes('application/json')
      ? await req.json()
      : null
    if (typeof body?.store === 'boolean') store = body.store
  } catch {
    // A malformed body is the same as no body: this endpoint's default is the
    // one that changes nothing.
  }

  // The avatar URL is read from the PLATFORM, never from the request body. A
  // client that could name the URL to fetch would have turned this function
  // into an SSRF proxy pointed at whatever it liked, authenticated as us.
  let avatarUrl: string | null
  let userId: string | null
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { authorization, apikey: anonKey },
    })
    if (!res.ok) return json({ error: 'unauthenticated' }, 401)
    const user = await res.json()
    userId = typeof user?.id === 'string' ? user.id : null
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
    const raw = metadata.avatar_url ?? metadata.picture
    avatarUrl = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
  } catch (error) {
    console.error('avatar: could not read the user', error)
    return json({ error: 'unavailable' }, 502)
  }

  if (userId === null) return json({ error: 'unauthenticated' }, 401)

  // FR-7.9 — turning the switch off. Nothing is fetched at all: the answer does
  // not depend on Google, and a Google outage must not stop somebody taking
  // their photograph down.
  if (store === false) {
    const cleared = await writeAvatar(supabaseUrl, userId, null)
    if (!cleared) return json({ error: 'unavailable' }, 502)
    return json({ avatar: null, stored: false }, 200)
  }

  // Not an error. Magic-link accounts have no picture, and neither do Google
  // accounts that never set one — 204 means "asked and answered, there is none",
  // which is what lets the browser stop asking.
  if (avatarUrl === null) {
    // Publishing a picture that does not exist still has to clear a stale one,
    // or removing the photograph at Google would leave the old face on a public
    // page for as long as the account lives.
    if (store === true) await writeAvatar(supabaseUrl, userId, null)
    return new Response(null, { status: 204, headers: CORS })
  }

  const dataUri = await fetchGoogleAvatar(avatarUrl, REQUESTED_SIZE)
  if (dataUri === null) return new Response(null, { status: 204, headers: CORS })

  if (store !== true) return json({ avatar: dataUri }, 200)

  // The published copy has to satisfy 0005's `avatar_shape` length check, and a
  // PNG at 96 px can exceed it where a JPEG never does. One retry at 64 px
  // rather than a refusal, because the alternative is telling somebody their
  // picture is unpublishable for a reason they cannot act on.
  let toStore = dataUri
  if (toStore.length > STORE_MAX_LENGTH) {
    const smaller = await fetchGoogleAvatar(avatarUrl, FALLBACK_SIZE)
    if (smaller !== null) toStore = smaller
  }
  if (toStore.length > STORE_MAX_LENGTH) {
    console.error(`avatar: ${toStore.length} characters is over the ${STORE_MAX_LENGTH} ceiling`)
    // The header still gets its picture; the profile keeps initials. Reported
    // rather than silently half-done, because `stored: false` is what lets the
    // settings screen say which of the two happened.
    return json({ avatar: dataUri, stored: false, reason: 'too-large' }, 200)
  }

  const stored = await writeAvatar(supabaseUrl, userId, toStore)
  return json({ avatar: dataUri, stored }, 200)
})

/**
 * The one write, and the one use of the service-role key in this codebase.
 *
 * `id=eq.<uuid>` where the uuid came from the verified JWT above — never from
 * the request. The key bypasses RLS by definition, so the filter is the whole of
 * the authorisation and it is built from something the caller cannot choose.
 */
async function writeAvatar(
  supabaseUrl: string,
  userId: string,
  value: string | null,
): Promise<boolean> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey) {
    console.error('avatar: SUPABASE_SERVICE_ROLE_KEY missing from the environment')
    return false
  }
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          'content-type': 'application/json',
          prefer: 'return=minimal',
        },
        body: JSON.stringify({ avatar: value }),
        signal: AbortSignal.timeout(5_000),
      },
    )
    // PostgREST reports failure in the body as well as the status, and this is
    // the one place that matters: a rejected check constraint comes back 400
    // with a message, not as a thrown error.
    if (!res.ok) {
      console.error(`avatar: PATCH profiles answered ${res.status}: ${await res.text()}`)
      return false
    }
    return true
  } catch (error) {
    console.error('avatar: could not write the profile', error)
    return false
  }
}

/**
 * Fetch, validate, and encode. Returns `null` for every kind of no — an
 * unexpected host, an unexpected type, too many bytes, a network failure. The
 * caller turns all of them into 204, because from the browser's point of view
 * they are the same fact: there is no picture to show.
 */
async function fetchGoogleAvatar(rawUrl: string, size: number): Promise<string | null> {
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
  const sized = `${url.origin}${url.pathname}=s${size}-c`

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
