# Supabase

Two projects (§14.5): **production**, and a free disposable one for CI. Schema
changes are the files in `migrations/`, applied in order, and **never typed into
the dashboard** — the migration is the record.

What is *not* in a migration is provider configuration, because Supabase keeps
it outside the database. That is what this file is for: the settings are made by
hand in a console, they are invisible to the build, and every one of them fails
at the worst possible moment if it is wrong.

## Applying migrations

```
supabase link --project-ref <ref>
supabase db push
```

Or paste the file into the SQL editor **once**, in order, and record that you
did. Either is fine; skipping one is not.

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

Same migrations, and **one deliberate difference: email/password sign-up stays
enabled.**

§13.3 creates two users and asserts that B cannot read A's rows. Creating a user
needs either the admin API — which means the service-role key, and S2 says that
key is never a GitHub secret — or ordinary email/password sign-up, which
production disables. Keeping it on here is what makes S2's "nothing in CI needs
it" true rather than aspirational.

The two projects are therefore configured differently on purpose. Do not
"correct" this one to match production; it holds no real data, and the moment it
matches, the security test that proves D14 has to be handed a key that must not
exist in CI.

## Keeping it awake

`.github/workflows/keepalive.yml` (D23). The free tier pauses after seven days
of inactivity, and the failure looks like a bug in auth rather than a sleeping
database — because browsing carries on working (D1). Delete the workflow once
real traffic keeps the project warm; the file says so at the top.
