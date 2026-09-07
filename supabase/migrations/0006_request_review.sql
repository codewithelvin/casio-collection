-- 0006 — the review page for D22's queue, and the one account that may read it.
--
-- WHY THIS EXISTS
--
-- The missing-reference form has worked correctly since M8 and nobody has ever
-- read what it wrote. `0003` gave `catalog_requests` no select policy — that
-- absence IS the denial, and it is the whole of FR-9.6 — and `0004` then revoked
-- select from `authenticated` as well. The intended reader was the service role,
-- from outside the browser, through `/casio-catalog requests`. That reader needs
-- a service-role key on somebody's laptop, and on the day this was written there
-- was none, so every report a visitor had filed sat in a table with no reader
-- and no notification. Nothing broke, nothing warned, and the false number was
-- the reassuring one.
--
-- The client's decision of 2026-09-08 is a review page **inside the site**,
-- visible to them and to nobody else.
--
-- WHAT THIS DOES NOT DO — AND WHY IT IS THE IMPORTANT PART
--
-- **It does not add a select policy to `catalog_requests`.** That table still
-- has none, exactly as `0003` left it, and §13.3's assertion that a select
-- returns nothing holds unchanged for every caller including this one. The read
-- happens inside a SECURITY DEFINER function instead.
--
-- That is D73's pattern and D73's reason. A page that fetched the table and
-- filtered for the admin in its *query* would be filtering a list any caller can
-- ask for unfiltered — the anon key is public by design (D14). RLS cannot answer
-- it either: RLS is asked "may this caller see this row", and every row here has
-- the same answer for the same person, so a policy permissive enough for the
-- admin is a policy that needs the admin's identity in it. Putting the identity
-- in a function keeps the table's denial absolute and makes the exception one
-- named, grantable, revocable thing.
--
-- FR-9.6 is amended rather than broken. It says the *reporter* never sees a
-- queue, a status, or anyone else's requests, and all three are still true: the
-- reader below is not the reporting user, there is still no status column, and
-- nothing in the browser can reach this without the flag.

-- The flag ---------------------------------------------------------------------
--
-- **It is not in the update allow-list, and that is the entire defence.**
--
-- `0005` ended by revoking update on `profiles` and granting it back column by
-- column (S9). A column added afterwards is therefore not writable by
-- `authenticated` unless somebody adds it to that list by hand — which is the
-- same property that protects `avatar` under D71, and the same mistake is
-- available here with a worse ending: put `is_admin` in the allow-list and any
-- signed-in visitor can PATCH themselves into reading everyone's reports.
--
-- Deliberately not a separate `admins` table. One boolean on a row that already
-- exists, already has RLS, and is already read through functions is less surface
-- than a new table with new policies to get wrong.
alter table public.profiles
  add column is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Reads the D22 request queue through catalog_request_queue(). Never add this '
  'column to the update grant on profiles: doing so lets any signed-in caller '
  'PATCH themselves into it. Set it with a service role or from the SQL editor.';

-- Who is asking ----------------------------------------------------------------
--
-- Split out from the queue reader because the screen needs the answer on its
-- own: a non-admin who types the URL is shown the 404 screen, not a refusal.
-- "Forbidden" would confirm the page exists, which is the same reasoning that
-- makes `profile_by_handle` return null for "no such handle" and for "private"
-- without distinguishing them.
--
-- `security definer` because `profiles` is not readable by a caller looking at
-- somebody else's row, and `stable` because it is read once per render.
create function public.is_admin() returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false);
$$;

-- The queue --------------------------------------------------------------------
--
-- **`user_id` is not in the return, on purpose.** The queue is a list of
-- references somebody could not find; it is not a list of people. There is no
-- reply mechanism — D22 makes this fire-and-forget — so an identity here would
-- be collected and displayed for no use anyone has named, which is the shape of
-- a leak rather than a feature.
--
-- What survives the omission is the only signal that actually orders the work:
-- `catalog_requests_user_ref_idx` is unique on (user_id, upper(ref)), so one row
-- IS one distinct person asking. The screen groups by reference and counts rows,
-- and gets "four people asked for this one" without ever learning which four.
--
-- No limit. FR-9.5 caps each account at twenty, so this table grows with users
-- and not with enthusiasm, and a silent cap here would be a queue quietly
-- reporting itself as shorter than it is — the exact failure this migration was
-- written to end.
create function public.catalog_request_queue()
  returns table (id bigint, ref text, link text, note text, created_at timestamptz)
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select r.id, r.ref, r.link, r.note, r.created_at
    from public.catalog_requests r
   where public.is_admin()
   order by r.created_at desc;
$$;

-- Grants -----------------------------------------------------------------------
--
-- `revoke` first, because a grant only ever adds — 0004's finding, and 0005
-- applied it up front rather than two months late.
--
-- Neither function is granted to `anon`, which is the difference between these
-- and 0005's four readers: a directory behind a sign-in is not a directory, but
-- a moderation queue in front of one is a moderation queue anybody can read.
revoke execute on function public.is_admin(), public.catalog_request_queue()
  from public, anon;

grant execute on function public.is_admin(), public.catalog_request_queue()
  to authenticated;

-- The one admin ----------------------------------------------------------------
--
-- **Edit the handle below before running this file.** It is deliberately not a
-- literal user id: an id is unreadable and unverifiable by the person pasting
-- it, and a wrong one would apply cleanly and silently grant nobody anything.
--
-- The `raise exception` is the point. This project has lost eight days to a SQL
-- editor that returns to idle whether or not it ran, and a whole feature to a
-- tool that reported "0 do not" while 354 did. A seeding statement that matches
-- no row and reports success is the same failure wearing a smaller hat, so this
-- one refuses to commit rather than leave the queue unreadable and the migration
-- looking applied.
do $$
declare
  -- `elvin`, codewithelvin@gmail.com, the first profile this project ever had
  -- (2026-08-25) and the only account named Elvin that has a handle at all —
  -- which is what makes this match unambiguous rather than a choice between two.
  target constant text := 'elvin';
  touched integer;
begin
  if target = 'REPLACE-WITH-YOUR-HANDLE' then
    raise exception
      'Set `target` in 0006 to your handle before running it. Find it with: select handle from public.profiles;';
  end if;

  update public.profiles set is_admin = true where lower(handle) = lower(target);
  get diagnostics touched = row_count;

  if touched <> 1 then
    raise exception 'No profile has handle %. Nothing was granted.', target;
  end if;
end
$$;
