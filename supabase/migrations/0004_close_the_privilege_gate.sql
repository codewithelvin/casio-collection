-- 0004 — close the privilege gates that 0001–0003 only *claimed* to close.
--
-- Found on 2026-08-25 by probing the live production project with nothing but
-- the anon key, immediately after 0001–0003 were applied for the first time.
-- Nothing had leaked and nothing was writable: every probe came back denied.
-- But it came back denied for **one reason where the migrations said two**, and
-- the gap is in the direction that matters.
--
-- The mechanism, and why an explicit `grant` never fixed it:
--
--   * Supabase runs `alter default privileges` on the `public` schema, so a
--     newly created table arrives with select/insert/update/delete already
--     granted to `anon` and `authenticated`.
--   * Postgres grants `execute` on a newly created function to `PUBLIC`, and
--     `PUBLIC` includes `anon`.
--
-- **A `grant` only ever adds.** 0002's `grant select on public.collection_items
-- to anon` did not narrow anon to select — anon already had all four verbs, and
-- the line was a no-op. Only a `revoke` removes anything, and 0003's
-- `delete_own_account` is the one place any of the three migrations wrote one,
-- which is exactly why it is the one function that was correctly locked.
--
-- Two consequences, and they are not the same size.
--
-- 1. THE TABLES — comments, not behaviour. Measured as anon: `delete` returned
--    204 on all three tables (privilege held, RLS matched no rows), `update`
--    returned 204 on `collection_items` and `catalog_requests`, and `insert`
--    reached the policy and was refused *by the policy*. So the tables are safe
--    and always were: RLS denied every one of them, which is precisely what D14
--    says is the whole of the defence. What was wrong was the record — 0002's
--    "anon gets select and nothing else" and 0003's "two gates, both shut"
--    describe a privilege gate that was never shut. The revokes below make those
--    sentences true, and being true is the point: the next person to read them
--    will otherwise decide a policy is redundant because a privilege has it
--    covered.
--
-- 2. THE FUNCTIONS — a real hole, because here there is no second gate at all.
--    `handle_available(text)` and `open_request_count(uuid)` are SECURITY
--    DEFINER: they read past RLS by design, so a policy cannot backstop them.
--    Both answered an anonymous caller — `handle_available` returned `true` and
--    `open_request_count` returned `0` over plain HTTP with only the publishable
--    key. 0003 grants each to `authenticated` and reads as though that were a
--    restriction; the default `PUBLIC` grant underneath it meant it was not.
--
--    `handle_available` is the one to care about. Its own comment says it "cannot
--    be used to enumerate handles, because you have to already know the string
--    to ask about it" — which is true of *listing* them and not of *testing*
--    them. Unauthenticated, one bit per call, no session and no rate limit is a
--    dictionary attack against every handle anyone would plausibly claim. That
--    is enumeration by another route, and FR-7.2 only ever needed it for someone
--    signed in and claiming a handle (`isHandleAvailable`, collection/api.ts).
--
--    `open_request_count` is narrower — you must already hold a user's uuid, and
--    uuids are not public — but nothing in the browser calls it. It is invoked
--    from inside the `own requests insertable` policy, which runs as the
--    function owner regardless of who is granted execute. Revoking it from
--    clients costs nothing at all.
--
-- Written as a migration rather than typed into the SQL editor because §14.5 is
-- the rule that makes this file findable at all, and because the same drift will
-- exist in any future project created from these migrations.

-- Functions ---------------------------------------------------------------------
--
-- `from public` is the operative half — `from anon` alone leaves the PUBLIC
-- grant in place and changes nothing. Both are named because a reader should not
-- have to know that to see the intent, and the same pairing is what 0003 already
-- wrote for `delete_own_account`.

revoke execute on function public.handle_available(text) from public, anon;
revoke execute on function public.open_request_count(uuid) from public, anon;

-- Re-granted after the revoke, because revoking from PUBLIC removes the implicit
-- right `authenticated` was relying on as a member of it.
grant execute on function public.handle_available(text) to authenticated;
grant execute on function public.open_request_count(uuid) to authenticated;

-- `is_profile_public(uuid)` is deliberately NOT here. 0002 grants it to anon on
-- purpose: it is what lets the "public items readable" policy resolve for a
-- signed-out visitor reading a published collection (FR-7.4).

-- Tables ------------------------------------------------------------------------
--
-- anon keeps `select` on profiles and collection_items and loses everything
-- else. That select is load-bearing: FR-7.4's published profile is read with no
-- session, and D23's keep-alive pings `profiles?select=id` as anon.

revoke insert, update, delete on public.profiles from anon;
revoke insert, update, delete on public.collection_items from anon;

-- authenticated keeps select and update on profiles, matching 0001. It loses
-- insert and delete, which 0001 says it should never have had: rows arrive
-- through `on_auth_user_created` and leave when auth.users cascades, and the
-- absence of a policy for either verb was doing all of the work.
revoke insert, delete on public.profiles from authenticated;

-- catalog_requests: anon gets nothing, authenticated gets insert and nothing
-- else. This is the table 0003 described as "two gates, both shut" — after this
-- it is.
revoke select, insert, update, delete on public.catalog_requests from anon;
revoke select, update, delete on public.catalog_requests from authenticated;

-- collection_items for `authenticated` is left exactly as 0002 set it: all four
-- verbs are granted there on purpose, and the policies are what scope them to
-- the caller's own rows.
