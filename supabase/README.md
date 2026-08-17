# Supabase

Two projects (§14.5): **production**, and a free disposable one for CI. Schema
changes are the files in `migrations/`, applied in order, and **never typed into
the dashboard** — the migration is the record.

What is *not* in a migration is provider configuration, because Supabase keeps
it outside the database. That is what this file is for: the settings are made by
hand in a console, they are invisible to the build, and every one of them fails
at the worst possible moment if it is wrong.

> [!important] Outstanding: drop `public.zzz_probe` from the production project
> A one-column table created by hand on 2026-08-17 to find out which project the
> SQL editor was writing to. It answered the question — but it was created
> **without RLS**, so it is readable by the anon key, which is to say by anybody.
> It is empty and always was, so nothing has leaked; it is still the exact state
> D14 exists to prevent, and it is the reason D14 pairs a table with its policies
> in one migration instead of trusting a follow-up.
>
> ```sql
> drop table if exists public.zzz_probe;
> ```
>
> It is also the first statement of the migration bundle, so applying the
> migrations removes it. Either way, confirm it is gone:
> `curl -s "$VITE_SUPABASE_URL/rest/v1/zzz_probe?select=x" -H "apikey: $VITE_SUPABASE_ANON_KEY"`
> should answer `PGRST205`, not `[]`.

## Applying migrations

```
supabase link --project-ref <ref>
supabase db push
```

Or paste the file into the SQL editor **once**, in order, and record that you
did. Either is fine; skipping one is not.

> [!warning] The SQL editor asks before it runs, and dismissing that modal runs nothing
> Supabase shows a *potentially destructive operation* modal for anything that
> changes the schema. **Dismissing it executes nothing and reports nothing** — the
> editor returns to idle, which is indistinguishable from a query that ran and had
> no output. This cost a session on 2026-08-17: the migrations were pasted, the
> modal was dismissed, the run looked fine, and every table was still missing an
> hour later.
>
> The paste has not run until the results pane says **`Success. No rows
> returned`**. If it says nothing at all, nothing happened. Also select nothing
> before pressing Run — with text selected, the editor runs only the selection.

### Checking it worked, from outside

The anon key alone answers this, so it needs no dashboard access:

```
curl -s "$VITE_SUPABASE_URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $VITE_SUPABASE_ANON_KEY"
```

`PGRST205 — Could not find the table 'public.profiles' in the schema cache` means
the migration did not run. `[]` means it did **and** that RLS is denying, which is
the correct answer for an anonymous caller.

**Do not use `GET /rest/v1/` as a health check.** It answers `401 — Only secret
API keys can be used for this endpoint`, which is that endpoint's own rule and
says nothing about the schema — while looking exactly like a rejected key.

## The anon key may not be called "anon" any more

Supabase now issues **publishable** keys — `sb_publishable_…`, around 46
characters, and **not a JWT**, so it has no dot-separated parts to decode and
names no project inside itself. §14.2 and D14 say "anon key" throughout, and this
is that key: public by design, safe in the bundle, and what goes in
`VITE_SUPABASE_ANON_KEY`.

Verified 2026-08-17 through `@supabase/supabase-js` itself rather than only over
HTTP — `from().select()`, `auth.getSession()` and
`auth.signInWithOAuth({ provider: 'google' })` all behave correctly with it. The
distinction mattered: a valid key the *pinned SDK* did not understand would have
failed at the moment somebody first tried to sign in, and nothing earlier would
have shown it.

**A `sb_secret_…` key is the other one** — the service-role key under a new name.
S2 applies to it unchanged: never in the browser, never a GitHub secret.

## Production project

| Setting | Value |
|---|---|
| Site URL | `https://casiovault.com` |
| Redirect URLs | `https://casiovault.com/auth/callback`, `http://localhost:5173/auth/callback` |
| Google provider | on — client ID and secret from the Google Cloud OAuth client |
| Email provider | **off**, including email/password (§9.1) |
| Magic link | off (D20) — turning it on is `AUTH_METHODS` plus this toggle plus §9.2's four remaining conditions |

The callback path carries no query string, and that is deliberate (§9.1): where
to send the user afterwards travels in the pending-intent slot (§9.4), so the
redirect URI stays a single fixed string that an allow-list can hold literally.
A redirect URI is compared for an exact match and never followed.

## Google Cloud

One OAuth client, type **Web application**.

| Field | Value |
|---|---|
| Authorised JavaScript origins | `https://casiovault.com`, `http://localhost:5173` |
| Authorised redirect URI | `https://<project-ref>.supabase.co/auth/v1/callback` |

**The redirect URI is Supabase's, not ours.** This is the one that gets typed
wrong: `casiovault.com` is where the *browser* ends up, but Google redirects to
Supabase, which then redirects to us. Supabase shows the exact string to use on
the Google provider page.

The consent screen must be **published**, not left in Testing. In Testing mode
Google caps the app at 100 users and expires refresh tokens after seven days, so
sign-in works for whoever set it up and silently rots for everyone else — which
is the failure mode D20 rejected magic link over. The scopes here are `email`,
`profile` and `openid`, all non-sensitive, so publishing needs no Google review.

## CI project

Same migrations, and **two deliberate differences, both about §13.3 being able
to create a user at all.**

| Setting | CI | Production | Why |
|---|---|---|---|
| Email/password sign-up | **on** | off | §13.3 needs two users |
| Confirm email | **off** | n/a | otherwise sign-up returns a user with *no session* |

§13.3 creates two users and asserts that B cannot read A's rows. Creating a user
needs either the admin API — which means the service-role key, and S2 says that
key is never a GitHub secret — or ordinary email/password sign-up, which
production disables. Keeping it on here is what makes S2's "nothing in CI needs
it" true rather than aspirational.

**Confirm email must also be off**, and the failure if it is not is the bad
kind. `signUp` succeeds, returns a user and no session, and every assertion
below it then runs as an anonymous caller — which passes, because an anonymous
caller genuinely cannot read anybody's rows. The test would be green and would
be proving nothing. `scripts/security/rls.ts` refuses to continue when a sign-up
comes back without a session, for exactly that reason.

The two projects are therefore configured differently on purpose. Do not
"correct" this one to match production; it holds no real data, and the moment it
matches, the security test that proves D14 has to be handed a key that must not
exist in CI.

Its URL and anon key go in as repository **variables** — `SUPABASE_CI_URL` and
`SUPABASE_CI_ANON_KEY` — beside the production pair, and for the same reason
(§14.2, D14). Until they exist the `security` job skips green with a warning and
says so; M7 does not close on a skip.

## Migrations, and which milestone each belongs to

| File | Milestone | Holds |
|---|---|---|
| `0001_profiles.sql` | M4 | `profiles`, the sign-up trigger, `set_updated_at`, RLS |
| `0002_collection_items.sql` | M5 | `collection_status`, `collection_items`, `is_profile_public`, RLS |
| — | M8 | `catalog_requests` and its insert-only policy (D22) |

A table arrives with the milestone that uses it, carrying its own policies in
the same file (D14). A table created early is a table briefly readable by the
whole internet, because the anon key is public and RLS is the only gate.

## Keeping it awake

`.github/workflows/keepalive.yml` (D23). The free tier pauses after seven days
of inactivity, and the failure looks like a bug in auth rather than a sleeping
database — because browsing carries on working (D1). Delete the workflow once
real traffic keeps the project warm; the file says so at the top.
