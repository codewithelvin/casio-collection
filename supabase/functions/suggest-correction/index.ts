// suggest-correction — the only server-side code in this project, and it exists
// for one reason: **SMTP cannot be spoken from a browser, and an SMTP password
// must never be in a bundle anyone can read.**
//
// The browser posts a suggestion about one watch; this validates it, renders it
// as an email a person can act on, and sends it through the maintainer's own
// SMTP server. It writes to no table and touches no catalogue data — the
// catalogue changes when a human changes it, which is the client's instruction
// of 2026-08-22 and D22's existing rule for the missing-reference queue.
//
// DEPLOYING IT
//
//   supabase secrets set \
//     SMTP_HOST=smtp.example.com \
//     SMTP_PORT=587 \
//     SMTP_USERNAME=... \
//     SMTP_PASSWORD=... \
//     SMTP_FROM='Casio Vault <noreply@example.com>' \
//     SUGGESTIONS_TO=you@example.com
//
//   supabase functions deploy suggest-correction --no-verify-jwt
//
// `--no-verify-jwt` is the client's decision that anyone may send a suggestion
// without an account. It is also what makes the guards below load-bearing
// rather than decorative — see the note on the rate limit, which is honest
// about what it does not stop.
//
// Nothing here is imported by the site's build: `tsconfig.app.json` includes
// only `src`, and this file is Deno rather than browser TypeScript.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

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
 * backstop for that is the SMTP provider's own sending limit, and the reason
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

  const host = Deno.env.get('SMTP_HOST')
  const port = Number(Deno.env.get('SMTP_PORT') ?? '587')
  const username = Deno.env.get('SMTP_USERNAME')
  const password = Deno.env.get('SMTP_PASSWORD')
  const from = Deno.env.get('SMTP_FROM')
  const to = Deno.env.get('SUGGESTIONS_TO')

  if (!host || !username || !password || !from || !to) {
    // Deployed without its secrets. Says so in the log and not to the reader:
    // a visitor cannot fix this, and the form's own message already tells them
    // to try again.
    console.error('suggest-correction: SMTP secrets are not set')
    return new Response('not configured', { status: 503, headers: CORS })
  }

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      // 465 is implicit TLS; 587 negotiates STARTTLS, which denomailer does
      // when `tls` is false. Getting this backwards is the usual reason a
      // working password appears not to work.
      tls: port === 465,
      auth: { username, password },
    },
  })

  try {
    await client.send({
      from,
      to,
      // The reference leads, so a mailbox sorted by subject sorts by watch.
      subject: `Casio Vault — ${header(suggestion.ref)}`,
      content: render(suggestion),
      // A reader's address is theirs, not ours: it addresses a reply and is
      // never the From, which would forge mail from a stranger's domain.
      ...(suggestion.email ? { replyTo: header(suggestion.email) } : {}),
    })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (caught) {
    console.error('suggest-correction: send failed', caught)
    return new Response('send failed', { status: 502, headers: CORS })
  } finally {
    await client.close().catch(() => {})
  }
})
