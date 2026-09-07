/**
 * Apply a migration to the Supabase project, and prove afterwards that it took.
 *
 * **This exists because of a specific failure, recorded in §14.5 and in the
 * vault's journal: the dashboard SQL editor asks before it runs, and dismissing
 * that modal executes nothing and reports nothing.** It returns to idle, which
 * is indistinguishable from a query with no output — so 0001 to 0003 were
 * believed applied for eight days while all three tables answered `PGRST205`.
 * Four rounds of asking the client to read settings back got nowhere; one
 * `create table public.zzz_probe (x int);` found the cause immediately.
 *
 * The lesson was *the way out of a dashboard loop is a probe the checker can
 * read*. This is that lesson turned into a command: it applies the file, and
 * `--check` reads the result back out of the catalogue rather than trusting
 * anything the apply step said about itself.
 *
 * ONE REQUEST FOR THE WHOLE FILE, and that is not a convenience. 0005 drops
 * `public profile readable` and creates the two functions that replace it
 * (D73); applied statement by statement, a failure in the middle leaves every
 * published profile unreadable. The Management API runs what it is given in a
 * single implicit transaction, so the file either lands or does not.
 *
 * THE TOKEN IS NEVER PRINTED, NEVER PASSED ON A COMMAND LINE, AND NEVER
 * COMMITTED. It is read from `SUPABASE_ACCESS_TOKEN` in the environment or from
 * an untracked `.env.local`, which `.gitignore` has covered since S2. A personal
 * access token is broader than the service-role key — it reaches every project
 * on the account — so it lives on the client's machine and nowhere else.
 *
 *   node scripts/supabase/migrate.ts supabase/migrations/0005_collectors.sql --dry
 *   node scripts/supabase/migrate.ts supabase/migrations/0005_collectors.sql
 *   node scripts/supabase/migrate.ts --check
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const API = 'https://api.supabase.com'

/**
 * A two-line `.env` reader rather than a dependency. It handles what these files
 * actually contain — `KEY=value`, blank lines, `#` comments — and deliberately
 * not quoting or interpolation, because a parser that silently half-understands
 * a credential file is worse than one that does not read it at all.
 */
async function readEnvFile(name: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(join(root, name), 'utf8')
    const out: Record<string, string> = {}
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index === -1) continue
      out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
    }
    return out
  } catch {
    return {}
  }
}

async function environment(): Promise<Record<string, string>> {
  // `.env.local` last so it wins: it is the file the token belongs in, and a
  // stale copy in `.env` should not shadow the one somebody just wrote.
  return { ...(await readEnvFile('.env')), ...(await readEnvFile('.env.local')) }
}

/** `https://abcdefgh.supabase.co` → `abcdefgh`. The ref is never typed by hand. */
function projectRef(url: string): string | null {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.(?:co|in)$/i.exec(url.trim().replace(/\/$/, ''))
  return match?.[1] ?? null
}

interface QueryFailure {
  ok: false
  status: number
  body: string
}
interface QuerySuccess {
  ok: true
  rows: unknown[]
}

/**
 * **The Management API reports failure in the body as often as in the status**,
 * which is the same trap `collection/api.ts` documents for PostgREST and the
 * reason nothing here treats a 200 as success on its own. The caller gets the
 * body either way and prints it.
 */
async function runSql(
  ref: string,
  token: string,
  query: string,
): Promise<QueryFailure | QuerySuccess> {
  const response = await fetch(`${API}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  const text = await response.text()
  if (!response.ok) return { ok: false, status: response.status, body: text }

  try {
    const parsed: unknown = JSON.parse(text)
    return { ok: true, rows: Array.isArray(parsed) ? parsed : [parsed] }
  } catch {
    return { ok: true, rows: [] }
  }
}

/**
 * What 0005 is supposed to have left behind, asked of the catalogue itself.
 *
 * Every line here is a fact the apply step could have got wrong while reporting
 * success — a dropped policy that is still there, a function that was created in
 * the wrong schema, a backfill that ran against an empty table. **The dropped
 * policy is the one that matters most**: with it still in place `is_listed` is
 * unenforceable (D73), and nothing on the site would look wrong.
 */
const CHECK_SQL = `
select
  to_regclass('public.model_counts')  is not null                       as model_counts_table,
  to_regclass('public.profile_links') is not null                       as profile_links_table,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'is_listed')                             as profiles_is_listed,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'avatar')                                as profiles_avatar,
  not exists (select 1 from pg_policies
               where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'public profile readable')            as blanket_policy_dropped,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('profile_by_handle','collectors',
                        'model_owner_counts','listed_owners'))          as readers_present,
  exists (select 1 from pg_trigger
           where tgname = 'collection_items_bump_counts')               as counter_trigger,

  -- 0006 (D79). The first three are the migration landing; the last two are the
  -- two ways it could land and still be wrong, which is why they are phrased as
  -- the *absence* of something rather than the presence.
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'is_admin')                              as profiles_is_admin,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_admin','catalog_request_queue'))            as queue_readers_present,
  (select count(*) from public.profiles where is_admin)                 as admin_count,
  -- FR-9.6 rests on this absence and D79 did not change it. A select policy
  -- appearing here later would be somebody making a read convenient.
  not exists (select 1 from pg_policies
               where schemaname = 'public' and tablename = 'catalog_requests'
                 and cmd = 'SELECT')                          as requests_still_unreadable,
  -- D71's rule, applied to D79's column. In the allow-list, this site hands any
  -- signed-in visitor everyone's reports.
  not exists (select 1 from information_schema.column_privileges
               where table_schema = 'public' and table_name = 'profiles'
                 and grantee = 'authenticated' and privilege_type = 'UPDATE'
                 and column_name = 'is_admin')                          as is_admin_unwritable,
  -- D14's own cautionary tale, still unverified since 2026-08-17: a probe table
  -- left in production with RLS off, readable by a public key. Reported, never
  -- dropped by this script — deleting somebody's table is not a check.
  to_regclass('public.zzz_probe') is not null                           as zzz_probe_present
`

async function main() {
  const argv = process.argv.slice(2)
  const check = argv.includes('--check')
  const dry = argv.includes('--dry')
  const file = argv.find((argument) => !argument.startsWith('--'))

  const env = { ...(await environment()), ...process.env } as Record<string, string>
  const token = env['SUPABASE_ACCESS_TOKEN']
  const url = env['VITE_SUPABASE_URL'] ?? ''
  const ref = projectRef(url)

  if (!ref) {
    console.error(
      `migrate: VITE_SUPABASE_URL is missing or not a project URL (${url || '(unset)'})`,
    )
    process.exit(1)
  }

  if (!token) {
    console.error(
      'migrate: SUPABASE_ACCESS_TOKEN is not set.\n\n' +
        '  Put it in .env.local, which .gitignore already covers:\n' +
        '      SUPABASE_ACCESS_TOKEN=sbp_...\n\n' +
        '  A personal access token reaches every project on the account, so it\n' +
        '  belongs on this machine and nowhere else — not in a GitHub secret and\n' +
        '  not in a chat window (S2).',
    )
    process.exit(1)
  }

  /**
   * **The variable was set and held the wrong kind of key for weeks.**
   *
   * On 2026-09-08 `SUPABASE_ACCESS_TOKEN` in `.env.local` held an `sb_secret_…`
   * **service-role key**. The Management API cannot decode that as a token and
   * answered `401 JWT could not be decoded`, which reads as an expired login
   * rather than as the wrong credential entirely — so `db:check` and `fn:list`
   * had both been failing in a way that invited re-authenticating instead of
   * looking at the value. A service-role key is also perfectly valid *somewhere
   * else* in this project (it is what `/casio-catalog requests` and the avatar
   * function want, S2), which is exactly why it lands in the wrong variable.
   *
   * The name of a variable is a status nobody checks, and it decays the same way
   * every other unchecked status here has. So the shape is checked before the
   * request rather than after the refusal, and the message names what was found
   * — never the value, which is a secret in both cases.
   */
  if (!token.startsWith('sbp_')) {
    const kind = token.startsWith('sb_secret_')
      ? 'a service-role secret key (sb_secret_…)'
      : token.startsWith('sb_publishable_')
        ? 'a publishable key (sb_publishable_…)'
        : `something starting "${token.slice(0, 3)}…"`
    console.error(
      `migrate: SUPABASE_ACCESS_TOKEN holds ${kind}, not a personal access token.\n\n` +
        '  This wants a Management API token, which starts `sbp_` and is made at\n' +
        '      https://supabase.com/dashboard/account/tokens\n\n' +
        '  A service-role key cannot run DDL through this API. If that is what is\n' +
        '  in there, it is a real key for a different job — give it its own name\n' +
        '  (SUPABASE_SERVICE_ROLE_KEY) rather than deleting it.',
    )
    process.exit(1)
  }

  if (check) {
    await runCheck(ref, token)
    return
  }

  if (!file) {
    console.error('migrate: name a migration file, or pass --check')
    process.exit(1)
  }

  const sql = await readFile(join(root, file), 'utf8')
  const statements = sql.split(';').filter((part) => part.trim() !== '').length

  console.log(`project ${ref}`)
  console.log(`file    ${file} — ${sql.length} bytes, roughly ${statements} statements`)

  if (dry) {
    console.log('\n--dry: nothing was sent.')
    return
  }

  console.log('\nApplying as one request, so a failure leaves nothing half-done…')
  const result = await runSql(ref, token, sql)

  if (!result.ok) {
    console.error(`\nFAILED — HTTP ${result.status}\n${result.body}`)
    process.exit(1)
  }

  console.log('Applied. Reading it back rather than believing it:\n')
  await runCheck(ref, token)
}

async function runCheck(ref: string, token: string) {
  const result = await runSql(ref, token, CHECK_SQL)
  if (!result.ok) {
    console.error(`check FAILED — HTTP ${result.status}\n${result.body}`)
    process.exit(1)
  }

  const row = (result.rows[0] ?? {}) as Record<string, unknown>
  const expected: [string, unknown][] = [
    ['model_counts_table', true],
    ['profile_links_table', true],
    ['profiles_is_listed', true],
    ['profiles_avatar', true],
    ['blanket_policy_dropped', true],
    ['readers_present', 4],
    ['counter_trigger', true],
    ['profiles_is_admin', true],
    ['queue_readers_present', 2],
    // Exactly one. Zero means the seeding block matched nobody and the page
    // renders a 404 for its own owner; more than one is a grant nobody made
    // deliberately, and this is the only place it would ever be noticed.
    ['admin_count', 1],
    ['requests_still_unreadable', true],
    ['is_admin_unwritable', true],
  ]

  let bad = 0
  for (const [key, want] of expected) {
    const got = row[key]
    const ok = got === want
    if (!ok) bad += 1
    console.log(`${ok ? '  ok  ' : '  NO  '} ${key}: ${String(got)}${ok ? '' : ` (want ${String(want)})`}`)
  }

  if (row['zzz_probe_present'] === true) {
    console.log(
      '\n  ! public.zzz_probe still exists. It is the M4 debugging table (D14);\n' +
        '    drop it with `drop table if exists public.zzz_probe;` once you are sure.',
    )
  }

  console.log(bad === 0 ? '\n0005 and 0006 are applied.' : `\n${bad} check(s) failed.`)
  if (bad > 0) process.exit(1)
}

main().catch((error: unknown) => {
  console.error(`migrate: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
