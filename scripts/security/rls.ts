/**
 * §13.3 — **the security test, and the proof behind D14.**
 *
 * D14 says row level security is the only access control this system has. The
 * anon key is public and always was, it ships inside a static bundle any
 * visitor can read, and there is no server of ours between a browser and the
 * database. So the policies in `supabase/migrations/` are not a layer of
 * defence — they are the whole of it, and a specification that says so without
 * a test that proves it is a specification making a promise on trust.
 *
 * This runs against a **real disposable Supabase project** (§14.5), because the
 * thing under test is Postgres evaluating policies. A mock of PostgREST would
 * assert that the mock refuses what we told it to refuse.
 *
 * D42 is why the CI project keeps email/password sign-up enabled while
 * production disables it: creating two users needs either that or the admin
 * API, and the admin API means putting the service-role key — which bypasses
 * every policy here — into CI in order to run the test that proves the policies
 * work. The two projects differ on purpose; `supabase/README.md` says so beside
 * the migrations.
 *
 * §13.3's second paragraph covers `catalog_requests`. That table arrives with
 * M8, and its assertions arrive with it.
 *
 * Run: SUPABASE_CI_URL=… SUPABASE_CI_ANON_KEY=… node scripts/security/rls.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env['SUPABASE_CI_URL'] ?? ''
const anonKey = process.env['SUPABASE_CI_ANON_KEY'] ?? ''

/**
 * No CI project yet, so there is nothing to test against.
 *
 * This exits 0, and that is a deliberate and uncomfortable choice worth stating
 * plainly: **a security test that skips is not a security test.** What makes it
 * defensible is that skipping is loud — a GitHub `::warning::` on every run —
 * and that M7 will not close on a skip. §13.3 is a launch blocker in its own
 * right, so the state this allows is "before the project exists", not "we chose
 * not to run it". The alternative, failing every push until somebody creates a
 * free Supabase project, teaches whoever set it up to ignore a red gate, which
 * is how a real failure gets waved through later.
 */
if (url === '' || anonKey === '') {
  console.log('::warning::§13.3 RLS test SKIPPED — SUPABASE_CI_URL / SUPABASE_CI_ANON_KEY are not set.')
  console.log('No CI Supabase project is configured yet (§14.5, D42). This is a launch blocker for M7.')
  process.exit(0)
}

let failures = 0

function check(claim: string, passed: boolean, detail = '') {
  if (passed) {
    console.log(`  ok    ${claim}`)
    return
  }
  failures += 1
  console.log(`  FAIL  ${claim}${detail ? ` — ${detail}` : ''}`)
}

function client(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * A user per run, with a random local part, because the CI project accumulates
 * them: deleting an auth user needs the admin API and S2 keeps that key out of
 * CI. A disposable project is exactly what makes that acceptable.
 */
async function signUp(label: string): Promise<{ supabase: SupabaseClient; id: string }> {
  const supabase = client()
  const email = `rls-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw!${Math.random()}` })

  if (error) throw new Error(`could not create user ${label}: ${error.message}`)
  if (!data.session || !data.user) {
    // The CI project has email confirmation on. signUp then returns a user with
    // no session and every assertion below would run as anon — passing for the
    // wrong reason, which is worse than failing.
    throw new Error(
      `user ${label} was created without a session. Turn OFF "Confirm email" on the CI project ` +
        '(Authentication → Providers → Email). See supabase/README.md.',
    )
  }
  return { supabase, id: data.user.id }
}

const WATCHES = ['f-91w-1', 'f-91w-3', 'dw-5600e-1v', 'ga-2100-1a1', 'gw-m5610u-1']

async function main() {
  console.log(`§13.3 — RLS against ${url}\n`)

  const a = await signUp('a')
  const b = await signUp('b')
  const anon = client()

  console.log('A marks five watches and writes a note')
  const { error: insertError } = await a.supabase.from('collection_items').insert(
    WATCHES.map((modelId, index) => ({
      user_id: a.id,
      model_id: modelId,
      status: index === 0 ? 'owned' : 'wishlist',
      note: index === 0 ? 'The one my father wore.' : null,
    })),
  )
  check('A can write their own rows', insertError === null, insertError?.message)

  const own = await a.supabase.from('collection_items').select('model_id').eq('user_id', a.id)
  check('A reads back all five', own.data?.length === 5, `got ${own.data?.length ?? 0}`)

  console.log('\nWhile A is private')
  const hidden = await b.supabase.from('collection_items').select('model_id').eq('user_id', a.id)
  check("B cannot read A's rows", (hidden.data ?? []).length === 0)

  const hiddenAnon = await anon.from('collection_items').select('model_id').eq('user_id', a.id)
  check("a signed-out visitor cannot read A's rows", (hiddenAnon.data ?? []).length === 0)

  /**
   * The one an unfiltered client would leak. RLS answers "which rows may this
   * caller see", and with a public-profile policy in place that is not the same
   * question as "which rows are this caller's" — which is why every read in
   * `collection/api.ts` filters by user_id and says so.
   */
  const everything = await b.supabase.from('collection_items').select('user_id')
  check(
    "an unfiltered select returns nothing of A's",
    !(everything.data ?? []).some((r: { user_id: string }) => r.user_id === a.id),
  )

  console.log('\nB cannot write to A')
  const forged = await b.supabase
    .from('collection_items')
    .insert({ user_id: a.id, model_id: 'dw-5600bb-1', status: 'owned' })
  check('B cannot insert a row for A', forged.error !== null)

  // An update or delete that no policy admits is not an error — the USING
  // clause simply matches no rows, and PostgREST reports success. So the
  // assertion is made by reading back as A: the row is what it was.
  await b.supabase
    .from('collection_items')
    .update({ status: 'owned', note: 'B was here' })
    .eq('user_id', a.id)
    .eq('model_id', 'f-91w-3')

  await b.supabase.from('collection_items').delete().eq('user_id', a.id).eq('model_id', 'f-91w-3')

  const survivor = await a.supabase
    .from('collection_items')
    .select('status, note')
    .eq('user_id', a.id)
    .eq('model_id', 'f-91w-3')
    .single()

  check("B's update did not change A's row", survivor.data?.status === 'wishlist')
  check("B's update did not write A's note", survivor.data?.note === null)
  check("B's delete did not remove A's row", survivor.error === null)

  console.log('\nB cannot publish A')
  await b.supabase.from('profiles').update({ is_public: true }).eq('id', a.id)
  const stillPrivate = await a.supabase.from('profiles').select('is_public').eq('id', a.id).single()
  check("B cannot flip A's is_public", stillPrivate.data?.is_public === false)

  console.log('\nOnce A publishes (FR-7.4)')
  const handle = `rls${Date.now().toString(36)}`.slice(0, 30)
  const published = await a.supabase
    .from('profiles')
    .update({ handle, is_public: true })
    .eq('id', a.id)
  check('A can publish their own profile', published.error === null, published.error?.message)

  const visible = await b.supabase.from('collection_items').select('model_id').eq('user_id', a.id)
  check("B can now read A's rows", visible.data?.length === 5, `got ${visible.data?.length ?? 0}`)

  const visibleAnon = await anon.from('collection_items').select('model_id').eq('user_id', a.id)
  check(
    'a signed-out visitor can read a published collection',
    visibleAnon.data?.length === 5,
    `got ${visibleAnon.data?.length ?? 0}`,
  )

  // Published is not writable. The read policy widened; nothing else did.
  const stillReadOnly = await b.supabase
    .from('collection_items')
    .delete()
    .eq('user_id', a.id)
    .eq('model_id', 'f-91w-1')
  const afterPublish = await a.supabase
    .from('collection_items')
    .select('model_id')
    .eq('user_id', a.id)
  check(
    'a published collection is still not writable by anyone else',
    stillReadOnly.error !== null || afterPublish.data?.length === 5,
  )

  console.log('\nAnd unpublishing takes effect immediately (FR-7.3)')
  await a.supabase.from('profiles').update({ is_public: false }).eq('id', a.id)
  const hiddenAgain = await b.supabase.from('collection_items').select('model_id').eq('user_id', a.id)
  check("B cannot read A's rows once sharing is off", (hiddenAgain.data ?? []).length === 0)

  // Leave the project tidy for the rows we can reach. The users stay; only the
  // service role can remove those, and S2 keeps that key out of CI.
  await a.supabase.from('collection_items').delete().eq('user_id', a.id)

  console.log(`\n${failures === 0 ? 'All §13.3 assertions hold.' : `${failures} FAILED.`}`)
  if (failures > 0) process.exit(1)
}

main().catch((error: unknown) => {
  console.error(`\n§13.3 could not run: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
