// suggest-correction — the only server-side code in this project, and it exists
// for one reason: **a mail credential must never be in a bundle anyone can
// read.** The anon key beside it is public by design (D14); an API key that can
// send mail as our domain is the exact opposite of that.
//
// The browser posts a suggestion about one watch; this validates it, renders it
// as an email a person can act on, and hands it to Resend over HTTPS. It writes
// to no table and touches no catalogue data — the catalogue changes when a human
// changes it, which is the client's instruction of 2026-08-22 and D22's existing
// rule for the missing-reference queue.
//
// WHY HTTP AND NOT SMTP — 2026-08-25.
//
// This was written against SMTP through `denomailer`, and on the day it was
// first deployed it never served a request. The function reached ACTIVE, and
// every call came back **503 with an empty body from `x-served-by:
// base/server`** — the gateway's answer when a worker fails to boot, which is
// not the same shape as this function's own 503 below (that one has a body and
// CORS headers, and distinguishing the two is what located this). The single
// piece of boot-time work was `import … denomailer@1.6.0`, whose latest release
// predates the current Deno runtime here.
//
// Resend's REST API removes the whole class of problem rather than pinning
// around it: no third-party import to boot, no raw TCP from an edge worker, and
// no 465-versus-587 implicit-TLS trap — which the old code carried a comment
// about because it is the usual reason a correct password looks broken. One
// `fetch` to one documented endpoint, and the failure mode is an HTTP status
// this function can read and log.
//
// DEPLOYING IT
//
//   supabase secrets set \
//     RESEND_API_KEY=re_... \
//     MAIL_FROM='Casio Vault <noreply@casiovault.com>' \
//     SUGGESTIONS_TO=you@example.com
//
//   supabase functions deploy suggest-correction --no-verify-jwt
//
// `MAIL_FROM` must be on a domain verified in Resend, or Resend refuses the
// send. The reader's own address never becomes the From — it becomes
// `reply_to`, because forging mail from a stranger's domain is not a feature.
//
// The old `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` and
// `SMTP_FROM` secrets are unused now and should be unset, so that the next
// person reading the secret list is not told a story about a transport this
// function no longer speaks.
//
// `--no-verify-jwt` is the client's decision that anyone may send a suggestion
// without an account. It is also what makes the guards below load-bearing
// rather than decorative — see the note on the rate limit, which is honest
// about what it does not stop.
//
// Nothing here is imported by the site's build: `tsconfig.app.json` includes
// only `src`, and this file is Deno rather than browser TypeScript. It now has
// **no imports at all**, which is the property that fixed it.

interface FieldChange {
  key: string
  label: string
  from: string
  to: string
}

interface Suggestion {
  ref: string
  modelId: string
  line: string
  series: string
  url: string
  changes: FieldChange[]
  note: string
  link: string
  email: string
}

const CORS = {
  // The site is served from one origin and this is a public endpoint either
  // way; what matters is the method and header allow-list below, which is the
  // narrowest pair that lets a JSON POST through a preflight.
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

/** 100 KB of JSON is already absurd for this form; a megabyte is an attack. */
const MAX_BODY = 100_000

/**
 * The rate limit, and **what it does not do**.
 *
 * This is an in-memory window inside one function instance. It stops the
 * ordinary case — a stuck retry, somebody leaning on the button, a crude script
 * from one address — and it does **not** survive a cold start or apply across
 * instances, so it is not a defence against a distributed flood. The real
 * backstop for that is Resend's own sending limit, and the reason
 * this is not a database table is that a table would need a migration, a
 * service-role write and its own RLS argument to buy protection the provider
 * already sells. If abuse ever actually happens, that table is the next step
 * and this comment is the brief for it.
 */
const WINDOW_MS = 60 * 60 * 1000
const PER_WINDOW = 5
const seen = new Map<string, number[]>()

function rateLimited(ip: string, now: number): boolean {
  const recent = (seen.get(ip) ?? []).filter((at) => now - at < WINDOW_MS)
  if (recent.length >= PER_WINDOW) {
    seen.set(ip, recent)
    return true
  }
  recent.push(now)
  seen.set(ip, recent)
  // Bounded, so a long-lived instance cannot grow a map of every address that
  // ever posted. The oldest entries are the least interesting.
  if (seen.size > 5_000) for (const key of [...seen.keys()].slice(0, 1_000)) seen.delete(key)
  return false
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

/** Anything a mail header would let through a line break is not a header. */
const header = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim()

function parse(body: unknown): Suggestion | null {
  if (typeof body !== 'object' || body === null) return null
  const raw = body as Record<string, unknown>

  const ref = text(raw['ref'], 40)
  if (ref === '') return null

  const changes: FieldChange[] = Array.isArray(raw['changes'])
    ? (raw['changes'] as unknown[])
        .filter(
          (change): change is Record<string, unknown> =>
            typeof change === 'object' && change !== null,
        )
        .slice(0, 40)
        .map((change) => ({
          key: text(change['key'], 40),
          label: text(change['label'], 60),
          from: text(change['from'], 200),
          to: text(change['to'], 200),
        }))
        .filter((change) => change.key !== '')
    : []

  const suggestion: Suggestion = {
    ref,
    modelId: text(raw['modelId'], 64),
    line: text(raw['line'], 40),
    series: text(raw['series'], 64),
    url: text(raw['url'], 500),
    changes,
    note: text(raw['note'], 1_000),
    link: text(raw['link'], 500),
    email: text(raw['email'], 200),
  }

  // The same rule the form applies, applied again where it cannot be edited
  // out: an empty suggestion is not a suggestion, and mailing one wastes the
  // attention this feature is asking for.
  if (suggestion.changes.length === 0 && suggestion.note === '') return null
  return suggestion
}

function render(suggestion: Suggestion): string {
  const lines = [
    // The reference first, on its own line, because the client asked to be able
    // to find the watch quickly — it is also the subject line.
    `Reference   ${suggestion.ref}`,
    `Model id    ${suggestion.modelId}`,
    `Filed under ${suggestion.line} / ${suggestion.series}`,
    suggestion.url ? `Page        ${suggestion.url}` : '',
    '',
  ]

  if (suggestion.changes.length > 0) {
    lines.push('PROPOSED', '')
    for (const change of suggestion.changes) {
      const from = change.from === '' ? '(nothing)' : change.from
      const to = change.to === '' ? '(remove it)' : change.to
      lines.push(`  ${change.label.padEnd(18)} ${from}  ->  ${to}`)
    }
    lines.push('')
  }

  if (suggestion.note !== '') lines.push('NOTE', '', suggestion.note, '')
  if (suggestion.link !== '') lines.push('SOURCE', '', suggestion.link, '')
  lines.push(
    suggestion.email === '' ? 'No reply address given.' : `Reply to: ${suggestion.email}`,
    '',
    'Nothing has changed in the catalogue. This is a suggestion from a reader,',
    'and a field still needs a page that states it before it can be published.',
  )
  return lines.join('\n')
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: CORS })
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('cf-connecting-ip') ??
    'unknown'
  if (rateLimited(ip, Date.now())) {
    return new Response('too many suggestions from here', { status: 429, headers: CORS })
  }

  const body = await request.text()
  if (body.length > MAX_BODY) return new Response('too large', { status: 413, headers: CORS })

  let suggestion: Suggestion | null = null
  try {
    suggestion = parse(JSON.parse(body))
  } catch {
    suggestion = null
  }
  if (!suggestion) return new Response('nothing to send', { status: 400, headers: CORS })

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('MAIL_FROM')
  const to = Deno.env.get('SUGGESTIONS_TO')

  if (!apiKey || !from || !to) {
    // Deployed without its secrets. Says so in the log and not to the reader:
    // a visitor cannot fix this, and the form's own message already tells them
    // to try again.
    //
    // This 503 has a body and CORS headers. The gateway's 503 — a worker that
    // failed to boot — has neither, and telling them apart is the difference
    // between "set the secrets" and "the code does not run at all".
    console.error('suggest-correction: RESEND_API_KEY, MAIL_FROM or SUGGESTIONS_TO is not set')
    return new Response('not configured', { status: 503, headers: CORS })
  }

  try {
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        // The reference leads, so a mailbox sorted by subject sorts by watch.
        subject: `Casio Vault — ${header(suggestion.ref)}`,
        // `text`, not `html`. What `render` produces is a plain-text report
        // lined up with spaces, and handing it to an HTML mail client would
        // collapse every one of them.
        text: render(suggestion),
        // A reader's address is theirs, not ours: it addresses a reply and is
        // never the From, which would forge mail from a stranger's domain.
        // Resend spells this field `reply_to`.
        ...(suggestion.email ? { reply_to: header(suggestion.email) } : {}),
      }),
    })

    if (!sent.ok) {
      // Resend answers with a JSON body naming the reason — an unverified
      // sending domain, a revoked key, a malformed From. It goes to the log in
      // full, because the reader is told nothing they could act on and the
      // maintainer is the only person who can fix any of them.
      const detail = await sent.text().catch(() => '')
      console.error(`suggest-correction: Resend answered ${sent.status} ${detail.slice(0, 500)}`)
      return new Response('send failed', { status: 502, headers: CORS })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (caught) {
    console.error('suggest-correction: send failed', caught)
    return new Response('send failed', { status: 502, headers: CORS })
  }
})
